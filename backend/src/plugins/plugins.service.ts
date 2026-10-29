import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, getMetadataArgsStorage } from 'typeorm'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { pluginsRootDir } from './plugin.paths'
import {
  readState,
  removeEntry,
  setEntry,
} from './plugin.state'
import { readInstalledManifest } from './plugin.loader'
import type {
  InstalledPluginInfo,
  PluginManifest,
} from './plugin.types'

const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9-]*$/

/**
 * 已安装插件的运行时管理（启停 / 卸载 / 清单）。
 *
 * 安装只走远程插件市场（RemoteMarketService）——内核与客户端都不再携带
 * 任何本地插件目录，所以这里没有「市场目录」概念，也没有从本地目录复制安装的路径。
 */
@Injectable()
export class PluginsService {
  private readonly logger = new Logger(PluginsService.name)

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // ==================== 查询 ====================

  installed(): InstalledPluginInfo[] {
    const state = readState()
    const result: InstalledPluginInfo[] = []
    for (const [id, entry] of Object.entries(state.plugins)) {
      const manifest = readInstalledManifest(id)
      if (!manifest) continue
      result.push({
        manifest,
        enabled: entry.enabled,
        installedAt: entry.installedAt,
        dir: path.join(pluginsRootDir(), id),
        /** 是否有更新由前端拿远程市场索引比对（catalogVersion 已随本地目录一并移除） */
        hasUpdate: false,
        missingDependencies: Object.keys(manifest.dependencies ?? {}).filter(
          (dep) => !state.plugins[dep]?.enabled,
        ),
      })
    }
    return result
  }

  /**
   * 前端运行时使用：返回已启用、且硬依赖都满足的 manifest。
   *
   * 依赖缺失的插件只从清单中剔除（前端菜单/路由/插槽随之消失），
   * 不改动它的 enabled 状态；依赖恢复后自动回来。
   */
  enabledManifests(): PluginManifest[] {
    const state = readState()
    const enabled = new Map<string, PluginManifest>()
    for (const [id, entry] of Object.entries(state.plugins)) {
      if (!entry.enabled) continue
      const manifest = readInstalledManifest(id)
      if (manifest) enabled.set(id, manifest)
    }

    // 注意：visiting 只跟踪当前递归路径（进出成对），否则菱形依赖
    // （如 receipts -> ocr 且 receipts -> hr -> ocr）会被误判成环。
    const resolved = new Map<string, boolean>()
    const resolvable = (id: string, visiting: Set<string>): boolean => {
      const cached = resolved.get(id)
      if (cached !== undefined) return cached
      if (visiting.has(id)) return false
      const manifest = enabled.get(id)
      if (!manifest) {
        resolved.set(id, false)
        return false
      }
      visiting.add(id)
      const ok = Object.keys(manifest.dependencies ?? {}).every((dep) => resolvable(dep, visiting))
      visiting.delete(id)
      resolved.set(id, ok)
      return ok
    }

    return [...enabled.entries()]
      .filter(([id]) => resolvable(id, new Set()))
      .map(([, manifest]) => manifest)
  }

  detail(id: string): { manifest: PluginManifest; installed: boolean; enabled: boolean } {
    this.assertId(id)
    const manifest = readInstalledManifest(id)
    if (!manifest) throw new NotFoundException(`插件 ${id} 未安装`)
    const entry = readState().plugins[id]
    return { manifest, installed: !!entry, enabled: !!entry?.enabled }
  }

  // ==================== 启停 / 卸载 ====================

  /**
   * 启用插件。
   *
   * 不因依赖缺失而拦截：缺硬依赖时插件会被 `enabledManifests()` 隐藏，
   * 装好/启用依赖后自动出现在菜单里。
   */
  enable(id: string): { id: string; enabled: true; restartRequired: true; missing: string[] } {
    this.assertInstalled(id)
    const state = readState()
    const manifest = readInstalledManifest(id)!
    const missing = Object.keys(manifest.dependencies ?? {}).filter(
      (dep) => !state.plugins[dep]?.enabled,
    )
    setEntry(id, { ...state.plugins[id], enabled: true, version: manifest.version })
    return { id, enabled: true, restartRequired: true, missing }
  }

  /**
   * 停用插件。
   *
   * 只停用它自己，不拦截、不牵连依赖它的插件：
   * - 依赖它的插件若真需要它的代码，会被 `enabledManifests()` 自动隐藏
   * - 只是共享数据的插件（如报表读票据表）继续正常工作
   */
  disable(id: string): { id: string; enabled: false; restartRequired: true } {
    this.assertInstalled(id)
    const state = readState()
    setEntry(id, { ...state.plugins[id], enabled: false })
    return { id, enabled: false, restartRequired: true }
  }

  async uninstall(
    id: string,
    keepData: boolean,
  ): Promise<{ id: string; keepData: boolean; restartRequired: true }> {
    this.assertInstalled(id)

    if (!keepData) {
      await this.dropPluginTables(id)
    }

    const dir = path.join(pluginsRootDir(), id)
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
    removeEntry(id)
    this.logger.log(`已卸载插件 ${id}（${keepData ? '保留数据' : '删除数据'}）`)
    return { id, keepData, restartRequired: true }
  }

  // ==================== 内部 ====================

  private assertId(id: string): void {
    if (!PLUGIN_ID_RE.test(id)) throw new BadRequestException('非法插件 ID')
  }

  private assertInstalled(id: string): void {
    this.assertId(id)
    if (!readState().plugins[id]) throw new NotFoundException(`插件 ${id} 未安装`)
  }

  /** 卸载且删除数据：按实体元数据找到表名并 DROP */
  private async dropPluginTables(id: string): Promise<void> {
    const dir = path.join(pluginsRootDir(), id)
    const manifest = readInstalledManifest(id)
    const tables = new Set<string>(manifest?.tables ?? [])
    try {
      const relative = manifest?.contributes?.server || 'server/index.js'
      const entryPath = path.join(dir, relative)
      if (fs.existsSync(entryPath)) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const entry = require(entryPath)
        const storage = getMetadataArgsStorage()
        for (const entity of entry?.entities ?? []) {
          const table = storage.tables.find((t) => t.target === entity)
          if (table?.name) tables.add(table.name)
        }
      }
    } catch (err) {
      this.logger.warn(`读取插件 ${id} 实体失败，按 manifest.tables 清理：${(err as Error).message}`)
    }

    for (const table of tables) {
      if (!/^[A-Za-z0-9_]+$/.test(table)) continue
      try {
        await this.dataSource.query(`DROP TABLE IF EXISTS "${table}"`)
        this.logger.log(`已删除插件表 ${table}`)
      } catch (err) {
        this.logger.warn(`删除插件表 ${table} 失败：${(err as Error).message}`)
      }
    }
  }
}
