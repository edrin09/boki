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
import {
  marketplaceDir,
  pluginsRootDir,
  readJson,
} from './plugin.paths'
import {
  markSyncRequired,
  readState,
  removeEntry,
  setEntry,
} from './plugin.state'
import {
  listCatalogManifests,
  readInstalledManifest,
} from './plugin.loader'
import type {
  CatalogPluginInfo,
  InstalledPluginInfo,
  PluginManifest,
} from './plugin.types'

const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9-]*$/

@Injectable()
export class PluginsService {
  private readonly logger = new Logger(PluginsService.name)

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // ==================== 查询 ====================

  catalog(): CatalogPluginInfo[] {
    const state = readState()
    const manifests = listCatalogManifests()
    return manifests.map((manifest) => {
      const entry = state.plugins[manifest.id]
      const installedManifest = entry ? readInstalledManifest(manifest.id) : null
      return {
        manifest,
        installed: !!entry,
        enabled: !!entry?.enabled,
        installedVersion: installedManifest?.version,
        hasUpdate: !!entry && !!installedManifest && installedManifest.version !== manifest.version,
      }
    })
  }

  installed(): InstalledPluginInfo[] {
    const state = readState()
    const result: InstalledPluginInfo[] = []
    for (const [id, entry] of Object.entries(state.plugins)) {
      const manifest = readInstalledManifest(id)
      if (!manifest) continue
      const catalog = readJson<PluginManifest>(
        path.join(marketplaceDir(), 'plugins', id, 'manifest.json'),
      )
      result.push({
        manifest,
        enabled: entry.enabled,
        installedAt: entry.installedAt,
        dir: path.join(pluginsRootDir(), id),
        catalogVersion: catalog?.version,
        hasUpdate: !!catalog && catalog.version !== manifest.version,
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
    const manifest =
      readInstalledManifest(id) ??
      readJson<PluginManifest>(path.join(marketplaceDir(), 'plugins', id, 'manifest.json'))
    if (!manifest) throw new NotFoundException(`插件 ${id} 不存在`)
    const entry = readState().plugins[id]
    return { manifest, installed: !!entry, enabled: !!entry?.enabled }
  }

  // ==================== 安装 / 启停 / 卸载 ====================

  install(id: string): { id: string; installed: string[]; restartRequired: true } {
    this.assertId(id)
    const installed: string[] = []
    this.installRecursive(id, installed, new Set())
    markSyncRequired()
    return { id, installed, restartRequired: true }
  }

  private installRecursive(id: string, installed: string[], visiting: Set<string>): void {
    if (visiting.has(id)) throw new BadRequestException(`插件依赖存在循环：${id}`)

    const sourceDir = path.join(marketplaceDir(), 'plugins', id)
    const manifest = readJson<PluginManifest>(path.join(sourceDir, 'manifest.json'))
    if (!manifest) throw new NotFoundException(`市场中没有插件 ${id}`)
    this.validateManifest(manifest)

    visiting.add(id)

    // 依赖先装（已安装但版本较旧时同步更新）
    for (const dep of Object.keys(manifest.dependencies ?? {})) {
      const entry = readState().plugins[dep]
      if (!entry) {
        this.installRecursive(dep, installed, visiting)
        continue
      }
      const depManifest = readJson<PluginManifest>(path.join(marketplaceDir(), 'plugins', dep, 'manifest.json'))
      if (depManifest && depManifest.version !== entry.version) {
        this.installRecursive(dep, installed, visiting)
      }
    }

    const existing = readState().plugins[id]
    if (existing && existing.version === manifest.version) {
      if (!existing.enabled) setEntry(id, { ...existing, enabled: true })
      if (!installed.includes(id)) installed.push(id)
      visiting.delete(id)
      return
    }

    const targetDir = path.join(pluginsRootDir(), id)
    this.copyPlugin(sourceDir, targetDir)
    setEntry(id, {
      enabled: existing?.enabled ?? true,
      version: manifest.version,
      installedAt: existing?.installedAt ?? new Date().toISOString(),
    })
    if (!installed.includes(id)) installed.push(id)
    this.logger.log(`${existing ? '已更新' : '已安装'}插件 ${id}@${manifest.version}`)
    visiting.delete(id)
  }

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

  private validateManifest(manifest: PluginManifest): void {
    if (!manifest.id || !PLUGIN_ID_RE.test(manifest.id)) {
      throw new BadRequestException('manifest.id 非法')
    }
    if (!manifest.version) throw new BadRequestException('manifest.version 缺失')
    if (!manifest.apiVersion || !/^\^?1(\.|$)/.test(manifest.apiVersion)) {
      throw new BadRequestException(`插件 apiVersion 与内核不兼容：${manifest.apiVersion}`)
    }
    if (manifest.scopeMode === 'global' && manifest.trust !== 'official') {
      throw new BadRequestException('scopeMode=global 仅允许 official 插件')
    }
  }

  /** 复制插件目录，排除源码与本地开发文件 */
  private copyPlugin(source: string, target: string): void {
    if (!fs.existsSync(source)) throw new NotFoundException(`插件源目录不存在：${source}`)
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true })
    fs.mkdirSync(target, { recursive: true })

    const skipDir = new Set(['node_modules', '.git', '.turbo', 'coverage'])
    const skipExt = new Set(['.ts', '.map', '.tsbuildinfo', '.vue'])

    const walk = (from: string, to: string) => {
      for (const dirent of fs.readdirSync(from, { withFileTypes: true })) {
        if (dirent.name.startsWith('.') && dirent.name !== '.env.example') continue
        const src = path.join(from, dirent.name)
        const dest = path.join(to, dirent.name)
        if (dirent.isDirectory()) {
          if (skipDir.has(dirent.name)) continue
          fs.mkdirSync(dest, { recursive: true })
          walk(src, dest)
        } else {
          if (skipExt.has(path.extname(dirent.name))) continue
          if (dirent.name === 'tsconfig.json') continue
          fs.copyFileSync(src, dest)
        }
      }
    }
    walk(source, target)
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
