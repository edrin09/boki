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

installPluginGlobals()
app.mount('#app')
