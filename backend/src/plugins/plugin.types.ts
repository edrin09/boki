import type { TypeOrmModuleOptions } from '@nestjs/typeorm'

/** 插件清单（manifest.json） */
export interface PluginManifest {
  id: string
  name: string
  version: string
  apiVersion: string
  engines?: { boki?: string }
  kind?: string
  scopeMode?: 'scoped' | 'global'
  trust?: 'official' | 'verified' | 'community'
  author?: string
  license?: string
  description?: string
  homepage?: string
  icon?: string
  dependencies?: Record<string, string>
  permissions?: string[]
  contributes?: {
    server?: string
    client?: string
    style?: string
    routes?: PluginRouteContribution[]
    menu?: PluginMenuContribution[]
    slots?: PluginSlotContribution[]
    settings?: Array<Record<string, any>>
  }
  integrity?: string
  signature?: string
  /** 卸载删除数据时的兜底表名（拿不到实体元数据时使用） */
  tables?: string[]
}

export interface PluginRouteContribution {
  path: string
  name?: string
  component?: string
  redirect?: string
  meta?: Record<string, any>
  children?: PluginRouteContribution[]
}

export interface PluginMenuContribution {
  group?: string
  title: string
  icon?: string
  path?: string
  permission?: string
  children?: PluginMenuContribution[]
}

export interface PluginSlotContribution {
  name: string
  component: string
}

export interface PluginStateEntry {
  enabled: boolean
  version: string
  installedAt: string
  keepData?: boolean
}

export interface PluginStateFile {
  version: 1
  plugins: Record<string, PluginStateEntry>
}

/** 插件后端入口导出的契约 */
export interface PluginServerEntry {
  module?: any
  entities?: any[]
  onInstall?: (ctx: any) => Promise<void> | void
  onUninstall?: (ctx: any) => Promise<void> | void
  onEnable?: (ctx: any) => Promise<void> | void
  onDisable?: (ctx: any) => Promise<void> | void
}

export interface LoadedPlugin {
  manifest: PluginManifest
  dir: string
  entry: PluginServerEntry
}

export interface PluginRuntime {
  plugins: LoadedPlugin[]
  modules: any[]
  entities: any[]
  errors: Array<{ id: string; message: string }>
}

export interface InstalledPluginInfo {
  manifest: PluginManifest
  enabled: boolean
  installedAt: string
  dir: string
  catalogVersion?: string
  hasUpdate?: boolean
}

export interface CatalogPluginInfo {
  manifest: PluginManifest
  installed: boolean
  enabled: boolean
  installedVersion?: string
  hasUpdate: boolean
}

export type DatabaseOptions = TypeOrmModuleOptions
