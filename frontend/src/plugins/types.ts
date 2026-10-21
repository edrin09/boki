import type { Component } from 'vue'
import type { RouteRecordRaw } from 'vue-router'

/** 插件清单中与前端相关的字段 */
export interface PluginManifest {
  id: string
  name: string
  version: string
  description?: string
  icon?: string
  contributes?: {
    client?: string
    style?: string
    routes?: PluginRouteContribution[]
    menu?: PluginMenuContribution[]
    slots?: PluginSlotContribution[]
  }
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

/** 插件前端入口注册的定义 */
export interface PluginClientDefinition {
  components?: Record<string, Component>
  slots?: Record<string, Component>
  setup?: (ctx: { manifest: PluginManifest }) => void
}

export interface PluginLoadError {
  id: string
  message: string
}

export interface PluginRuntimeState {
  manifests: PluginManifest[]
  defs: Record<string, PluginClientDefinition>
  routes: RouteRecordRaw[]
  menus: PluginMenuContribution[]
  slots: Record<string, Component[]>
  errors: PluginLoadError[]
  loaded: boolean
}
