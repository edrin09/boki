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
      })
    }
    return result
  }

  /** 前端运行时使用：只返回已启用的 manifest */
  enabledManifests(): PluginManifest[] {
    const state = readState()
    return Object.entries(state.plugins)
      .filter(([, entry]) => entry.enabled)
      .map(([id]) => readInstalledManifest(id))
      .filter((m): m is PluginManifest => !!m)
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

  enable(id: string): { id: string; enabled: true; restartRequired: true; missing: string[] } {
    this.assertInstalled(id)
    const state = readState()
    const manifest = readInstalledManifest(id)!
    const missing = Object.keys(manifest.dependencies ?? {}).filter(
      (dep) => !state.plugins[dep]?.enabled,
    )
    if (missing.length) {
      throw new BadRequestException(`依赖插件未启用：${missing.join(', ')}`)
    }
    setEntry(id, { ...state.plugins[id], enabled: true, version: manifest.version })
    return { id, enabled: true, restartRequired: true, missing: [] }
  }

  disable(id: string): { id: string; enabled: false; restartRequired: true } {
    this.assertInstalled(id)
    const dependents = this.findDependents(id, true)
    if (dependents.length) {
      throw new BadRequestException(
        `以下插件依赖 ${id}，请先停用：${dependents.join(', ')}`,
      )
    }
    const state = readState()
    setEntry(id, { ...state.plugins[id], enabled: false })
    return { id, enabled: false, restartRequired: true }
  }

  async uninstall(
    id: string,
    keepData: boolean,
  ): Promise<{ id: string; keepData: boolean; restartRequired: true }> {
    this.assertInstalled(id)
    const dependents = this.findDependents(id, false)
    if (dependents.length) {
      throw new BadRequestException(
        `以下插件依赖 ${id}，请先卸载：${dependents.join(', ')}`,
      )
    }

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

  private findDependents(id: string, onlyEnabled: boolean): string[] {
    const state = readState()
    const result: string[] = []
    for (const [pid, entry] of Object.entries(state.plugins)) {
      if (pid === id) continue
      if (onlyEnabled && !entry.enabled) continue
      const manifest = readInstalledManifest(pid)
      if (manifest?.dependencies && Object.prototype.hasOwnProperty.call(manifest.dependencies, id)) {
        result.push(pid)
      }
    }
    return result
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
