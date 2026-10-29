import * as fs from 'node:fs'
import * as path from 'node:path'
import { Logger } from '@nestjs/common'
import {
  coreDistDir,
  ensureDir,
  pluginsRootDir,
  readJson,
} from './plugin.paths'
import { readState } from './plugin.state'
import type {
  LoadedPlugin,
  PluginManifest,
  PluginRuntime,
  PluginServerEntry,
} from './plugin.types'

const logger = new Logger('PluginLoader')

/** 读取已安装目录中的 manifest */
export function readInstalledManifest(id: string): PluginManifest | null {
  return readJson<PluginManifest>(path.join(pluginsRootDir(), id, 'manifest.json'))
}

/** 创建运行时模块解析链接：@core -> backend/dist，@plugin -> data/plugins */
export function ensureRuntimeLinks(): void {
  const nodeModules = path.join(pluginsRootDir(), 'node_modules')
  try {
    ensureDir(nodeModules)
  } catch (err) {
    // 典型触发：目录落在 Program Files 等只读位置（未注入 BOKI_PLUGINS_DIR 的桌面部署）。
    // 裸 EPERM 栈对用户不可读，这里翻译成可操作的提示。
    throw new Error(
      `插件运行时目录不可写：${nodeModules}（${(err as NodeJS.ErrnoException).code ?? (err as Error).message}）。` +
        `请设置环境变量 BOKI_PLUGINS_DIR 指向可写目录（桌面版默认应为 ProgramData 下路径）。`,
    )
  }
  const links: Array<[string, string]> = [
    [path.join(nodeModules, '@core'), coreDistDir()],
    [path.join(nodeModules, '@plugin'), pluginsRootDir()],
  ]
  for (const [link, target] of links) {
    try {
      if (fs.existsSync(link)) continue
      if (!fs.existsSync(target)) {
        logger.warn(`链接目标不存在，跳过：${target}`)
        continue
      }
      fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir')
    } catch (err) {
      logger.warn(`创建插件依赖链接失败 ${link}: ${(err as Error).message}`)
    }
  }
}

function validateManifest(manifest: PluginManifest): string[] {
  const errors: string[] = []
  if (!manifest.id || !/^[a-z0-9][a-z0-9-]*$/.test(manifest.id)) {
    errors.push('id 必须是小写字母/数字/连字符')
  }
  if (!manifest.version) errors.push('缺少 version')
  if (!manifest.apiVersion) errors.push('缺少 apiVersion')
  else if (!/^\^?1(\.|$)/.test(manifest.apiVersion)) {
    errors.push(`apiVersion ${manifest.apiVersion} 与内核 1.x 不兼容`)
  }
  return errors
}

function requireEntry(dir: string, manifest: PluginManifest): PluginServerEntry | null {
  const relative = manifest.contributes?.server || 'server/index.js'
  const entryPath = path.resolve(dir, relative)
  if (!fs.existsSync(entryPath)) {
    logger.warn(`插件 ${manifest.id} 缺少后端入口：${relative}`)
    return null
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const loaded = require(entryPath)
    return (loaded?.default && !loaded.module ? loaded.default : loaded) as PluginServerEntry
  } catch (err) {
    logger.error(`加载插件 ${manifest.id} 失败：${(err as Error).message}`)
    return null
  }
}

function sortByDependencies(items: LoadedPlugin[]): LoadedPlugin[] {
  const byId = new Map(items.map((p) => [p.manifest.id, p]))
  const result: LoadedPlugin[] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()

  const visit = (id: string) => {
    if (visited.has(id)) return
    if (visiting.has(id)) {
      logger.warn(`检测到插件循环依赖：${id}`)
      return
    }
    const plugin = byId.get(id)
    if (!plugin) return
    visiting.add(id)
    for (const dep of Object.keys(plugin.manifest.dependencies ?? {})) {
      visit(dep)
    }
    visiting.delete(id)
    visited.add(id)
    result.push(plugin)
  }

  for (const item of items) visit(item.manifest.id)
  return result
}

/**
 * 加载已安装插件。
 *
 * - 实体：读取所有已安装插件（含已停用），避免启停时表结构被误判
 * - 模块：只加载已启用且依赖已启用的插件
 */
export function loadPluginRuntime(): PluginRuntime {
  ensureRuntimeLinks()
  const state = readState()
  const installedRoot = pluginsRootDir()
  const loadedEntries = new Map<string, LoadedPlugin>()
  const errors: Array<{ id: string; message: string }> = []

  if (fs.existsSync(installedRoot)) {
    for (const dirent of fs.readdirSync(installedRoot, { withFileTypes: true })) {
      if (!dirent.isDirectory() || dirent.name === 'node_modules' || dirent.name.startsWith('.')) continue
      const id = dirent.name
      const dir = path.join(installedRoot, id)
      const manifest = readJson<PluginManifest>(path.join(dir, 'manifest.json'))
      if (!manifest) {
        errors.push({ id, message: '缺少 manifest.json' })
        continue
      }
      const validation = validateManifest(manifest)
      if (validation.length) {
        errors.push({ id, message: validation.join('; ') })
        continue
      }
      const entry = requireEntry(dir, manifest)
      if (!entry) {
        errors.push({ id, message: '后端入口加载失败' })
        continue
      }
      loadedEntries.set(id, { manifest, dir, entry })
    }
  }

  const enabled: LoadedPlugin[] = []
  for (const [id, plugin] of loadedEntries) {
    if (!state.plugins[id]?.enabled) continue
    const missing = Object.keys(plugin.manifest.dependencies ?? {}).filter(
      (dep) => !state.plugins[dep]?.enabled || !loadedEntries.has(dep),
    )
    if (missing.length) {
      errors.push({ id, message: `依赖未启用：${missing.join(', ')}` })
      continue
    }
    enabled.push(plugin)
  }

  const plugins = sortByDependencies(enabled)
  const entities: any[] = []
  for (const plugin of loadedEntries.values()) {
    if (Array.isArray(plugin.entry.entities)) entities.push(...plugin.entry.entities)
  }

  return {
    plugins,
    modules: plugins.map((p) => p.entry.module).filter(Boolean),
    entities,
    errors,
  }
}
