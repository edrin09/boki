import { createApp } from 'vue'
import * as Vue from 'vue'
import { createPinia } from 'pinia'
import * as Pinia from 'pinia'
import * as VueRouter from 'vue-router'
import ElementPlus, * as ElementPlusNs from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import axios from 'axios'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import 'element-plus/dist/index.css'
import '@/styles/index.css'

import App from './App.vue'
import VaultUnlock from './views/VaultUnlock.vue'
import router, { resetBusinessRoutes } from './router'
import { setupDirectives } from './directives/permission'
import { setUnauthorizedHandler } from '@/api'
import { useUserStore } from './stores/user'

/**
 * 插件运行时共享依赖。
 *
 * 插件 bundle 构建时把这些包标记为 external，运行时从 window 读取，
 * 从而与内核共用同一份 Vue / Element Plus 实例。
 */
function installPluginGlobals(): void {
  Object.assign(window, {
    Vue,
    VueRouter,
    Pinia,
    ElementPlus: ElementPlusNs,
    ElementPlusIconsVue,
    axios,
    dayjs,
    XLSX,
  })
}

/** vault 状态（`GET /api/vault/status` 的 data 部分） */
interface VaultBootStatus {
  enabled: boolean
  locked: boolean
  migrating: boolean
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * 库已加密且尚未解锁时，整站先渲染解锁页、不挂载路由（方案 §11）。
 *
 * 用原生 axios 直连而非封装的 http 实例：此时还没有任何登录态，
 * 也不希望网络抖动触发一轮错误提示。
 */
async function vaultRequiresUnlock(): Promise<boolean> {
  const base = import.meta.env.VITE_API_BASE_URL || '/api'
  const maxAttempts = 8
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await axios.get(`${base}/vault/status`, { timeout: 3000 })
      const data = resp.data?.data as VaultBootStatus | undefined
      if (data) return data.enabled === true && (data.locked === true || data.migrating === true)
      return false
    } catch {
      // 后端可能尚未就绪（桌面壳刚拉起 / 引导壳端口交接中），稍候重试
      if (attempt === maxAttempts) return false
      await sleep(500)
    }
  }
  return false
}

/** 应用入口：先判定 vault 是否需要解锁，再决定挂载解锁页还是完整应用 */
async function boot(): Promise<void> {
  installPluginGlobals()

  // 锁定态：只挂解锁页。
  // 解锁成功后 VaultUnlock 会重载页面，重新进入本函数并走完整启动。
  if (await vaultRequiresUnlock()) {
    const unlockApp = createApp(VaultUnlock)
    unlockApp.use(ElementPlus, { locale: zhCn })
    for (const [name, component] of Object.entries(ElementPlusIconsVue)) {
      unlockApp.component(name, component)
    }
    unlockApp.mount('#app')
    return
  }

  const app = createApp(App)
  const pinia = createPinia()

  app.use(pinia)

  // 全量注册 Element Plus 图标，便于菜单按名称动态渲染
  for (const [name, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(name, component)
  }

  app.use(ElementPlus, { locale: zhCn })

  setupDirectives(app)
  app.use(router)

  // Token 失效时统一跳转登录页
  setUnauthorizedHandler(() => {
    const userStore = useUserStore()
    userStore.reset()
    resetBusinessRoutes()
    const current = router.currentRoute.value
    if (current.path !== '/login') {
      router.push({ path: '/login', query: current.fullPath !== '/' ? { redirect: current.fullPath } : {} })
    }
  })

  app.mount('#app')
}

void boot()
