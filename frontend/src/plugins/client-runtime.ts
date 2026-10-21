import type { PluginClientDefinition } from './types'

declare global {
  interface Window {
    __BOKI_PLUGIN_DEFS__?: Record<string, PluginClientDefinition>
  }
}

/**
 * 插件前端入口调用的注册函数。
 *
 * 由插件构建时内联（alias `@boki/plugin-client`），运行时写入全局注册表，
 * 内核脚本加载完成后读取。重复注册视为热更新，直接覆盖。
 */
export function registerPlugin(id: string, definition: PluginClientDefinition): void {
  if (typeof window === 'undefined') return
  window.__BOKI_PLUGIN_DEFS__ = window.__BOKI_PLUGIN_DEFS__ || {}
  window.__BOKI_PLUGIN_DEFS__[id] = definition
}
