/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_APP_TITLE?: string
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  Vue: typeof import('vue')
  VueRouter: typeof import('vue-router')
  Pinia: typeof import('pinia')
  ElementPlus: typeof import('element-plus')
  ElementPlusIconsVue: typeof import('@element-plus/icons-vue')
  axios: typeof import('axios').default
  dayjs: typeof import('dayjs')
  XLSX: typeof import('xlsx')
}