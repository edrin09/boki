import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import 'element-plus/dist/index.css'
import '@/styles/index.css'

import App from './App.vue'
import router from './router'
import { setupDirectives } from './directives/permission'
import { setUnauthorizedHandler } from '@/api'
import { useUserStore } from './stores/user'

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
  const current = router.currentRoute.value
  if (current.path !== '/login') {
    router.push({ path: '/login', query: current.fullPath !== '/' ? { redirect: current.fullPath } : {} })
  }
})

app.mount('#app')