import { ref, type Component } from 'vue'
import type { RouteRecordRaw } from 'vue-router'
import { get } from '@/api'
import type {
  PluginClientDefinition,
  PluginManifest,
  PluginMenuContribution,
  PluginRouteContribution,
  PluginRuntimeState,
} from './types'

/** 插件运行时版本号：加载/重置后自增，供菜单等 computed 依赖 */
export const pluginRuntimeVersion = ref(0)

const state: PluginRuntimeState = {
  manifests: [],
  defs: {},
  routes: [],
  menus: [],
  slots: {},
  errors: [],
  loaded: false,
}

/** 每个插件注入的 script/link 资源，便于登出时清理 */
const injectedAssets: HTMLElement[] = []

let loadPromise: Promise<void> | null = null

function pluginAssetUrl(id: string, relative: string): string {
  const clean = relative.replace(/^\/+/, '')
  return `/api/plugin-assets/${encodeURIComponent(id)}/${clean}`
}

function injectStyle(id: string, href: string): Promise<void> {
  return new Promise((resolve) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = pluginAssetUrl(id, href)
    link.onload = () => resolve()
    link.onerror = () => resolve()
    document.head.appendChild(link)
    injectedAssets.push(link)
  })
}

function injectScript(id: string, src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existed = document.querySelector<HTMLScriptElement>(
      `script[data-boki-plugin="${id}"]`,
    )
    if (existed) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = pluginAssetUrl(id, src)
    script.async = false
    script.dataset.bokiPlugin = id
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`脚本加载失败：${src}`))
    document.head.appendChild(script)
    injectedAssets.push(script)
  })
}

function findComponent(
  def: PluginClientDefinition | undefined,
  name?: string,
): Component | undefined {
  if (!name || !def?.components) return undefined
  return def.components[name]
}

function buildRoutes(
  manifest: PluginManifest,
  def: PluginClientDefinition,
  contributions: PluginRouteContribution[],
  topLevel = true,
): RouteRecordRaw[] {
  const result: RouteRecordRaw[] = []

  for (const item of contributions) {
    const children = item.children?.length
      ? buildRoutes(manifest, def, item.children, false)
      : undefined

    // 带 component 但插件没有导出该组件：整条路由跳过
    if (item.component && item.component !== '__layout__' && !findComponent(def, item.component)) {
      console.warn(`[plugin:${manifest.id}] 未找到组件 ${item.component}，路由 ${item.path} 已跳过`)
      continue
    }
    // 纯分组路由的所有子路由都被跳过时，父级也不再挂载
    if (item.children?.length && (!children || children.length === 0)) continue

    const record: RouteRecordRaw = {
      path: item.path,
      name: item.name,
      redirect: item.redirect,
      meta: { ...(item.meta ?? {}), plugin: manifest.id },
      children,
    } as RouteRecordRaw

    if (item.component === '__layout__') {
      record.component = () => import('@/components/layout/AppLayout.vue')
    } else if (item.component) {
      record.component = findComponent(def, item.component)
    }

    // 顶层页面未显式提供 layout 时自动包一层，保证侧边栏与头部正常显示
    if (topLevel && item.component && item.component !== '__layout__' && !children?.length) {
      result.push({
        path: item.path,
        component: () => import('@/components/layout/AppLayout.vue'),
        meta: { title: item.meta?.title },
        children: [
          {
            path: '',
            name: item.name,
            component: record.component,
            meta: record.meta,
          } as RouteRecordRaw,
        ],
      } as RouteRecordRaw)
      continue
    }

    result.push(record)
  }

  return result
}

/** 读取已启用插件清单并注入前端资源 */
export async function ensurePluginsLoaded(): Promise<void> {
  if (state.loaded) return
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    let manifests: PluginManifest[] = []
    try {
      manifests = await get<PluginManifest[]>('/plugins/manifests')
    } catch (err) {
      console.warn('[plugins] 获取插件清单失败：', (err as Error).message)
      state.loaded = true
      pluginRuntimeVersion.value += 1
      return
    }

    state.manifests = Array.isArray(manifests) ? manifests : []

    for (const manifest of state.manifests) {
      const contributes = manifest.contributes ?? {}
      try {
        if (contributes.style) await injectStyle(manifest.id, contributes.style)
        if (contributes.client) await injectScript(manifest.id, contributes.client)
      } catch (err) {
        state.errors.push({ id: manifest.id, message: (err as Error).message })
        continue
      }

      const def = window.__BOKI_PLUGIN_DEFS__?.[manifest.id]
      if (!def) {
        state.errors.push({ id: manifest.id, message: '前端入口未注册组件' })
        continue
      }
      state.defs[manifest.id] = def
      try {
        def.setup?.({ manifest })
      } catch (err) {
        state.errors.push({ id: manifest.id, message: `setup 失败：${(err as Error).message}` })
      }

      state.routes.push(...buildRoutes(manifest, def, contributes.routes ?? []))
      state.menus.push(...(contributes.menu ?? []))

      for (const slot of contributes.slots ?? []) {
        const component = findComponent(def, slot.component)
        if (!component) continue
        state.slots[slot.name] = [...(state.slots[slot.name] ?? []), component]
      }
    }

    state.loaded = true
    pluginRuntimeVersion.value += 1
  })()

  return loadPromise
}

/** 重置前端插件运行时（登出时调用） */
export function resetPluginRuntime(): void {
  for (const asset of injectedAssets.splice(0)) asset.remove()
  state.manifests = []
  state.defs = {}
  state.routes = []
  state.menus = []
  state.slots = {}
  state.errors = []
  state.loaded = false
  loadPromise = null
  pluginRuntimeVersion.value += 1
}

export function getPluginRoutes(): RouteRecordRaw[] {
  return state.routes
}

export function getPluginMenus(): PluginMenuContribution[] {
  return state.menus
}

export function getPluginSlotComponents(name: string): Component[] {
  return state.slots[name] ?? []
}

export function getPluginRuntimeState(): Readonly<PluginRuntimeState> {
  return state
}
