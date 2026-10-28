import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'

/**
 * 单个插件前端 IIFE 构建配置。
 *
 * 由 scripts/build-client.mjs 以 BOKI_PLUGIN_ID 环境变量逐个调用。
 * 共享依赖一律外置为 window 全局变量（见 frontend/src/main.ts）。
 *
 * 注意：boki-market 本身没有 node_modules，vite / @vitejs/plugin-vue
 * 统一从 frontend/node_modules 解析。
 */
const pluginId = process.env.BOKI_PLUGIN_ID
if (!pluginId) {
  throw new Error('缺少 BOKI_PLUGIN_ID')
}

const frontendRequire = createRequire(
  fileURLToPath(new URL('../frontend/package.json', import.meta.url)),
)
const { defineConfig } = await import(pathToFileURL(frontendRequire.resolve('vite')).href)
const vue = (await import(pathToFileURL(frontendRequire.resolve('@vitejs/plugin-vue')).href))
  .default

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const frontendSrc = fileURLToPath(new URL('../frontend/src', import.meta.url))
const pluginDir = fileURLToPath(new URL(`./plugins/${pluginId}`, import.meta.url))
const pluginClientDir = `${pluginDir}/client`

const globals = {
  vue: 'Vue',
  'vue-router': 'VueRouter',
  pinia: 'Pinia',
  'element-plus': 'ElementPlus',
  '@element-plus/icons-vue': 'ElementPlusIconsVue',
  axios: 'axios',
  dayjs: 'dayjs',
  xlsx: 'XLSX',
}

export default defineConfig({
  root: repoRoot,
  plugins: [vue()],
  resolve: {
    alias: {
      '@': frontendSrc,
      '@boki/plugin-client': fileURLToPath(
        new URL('../frontend/src/plugins/client-runtime.ts', import.meta.url),
      ),
    },
  },
  css: {
    preprocessorOptions: { scss: { api: 'modern-compiler' } },
  },
  build: {
    target: 'es2020',
    outDir: pluginClientDir,
    emptyOutDir: false,
    cssCodeSplit: false,
    minify: false,
    lib: {
      entry: `${pluginDir}/client/index.ts`,
      formats: ['iife'],
      name: `BokiPlugin_${pluginId.replace(/-/g, '_')}`,
      fileName: () => 'index.js',
      cssFileName: 'style',
    },
    rollupOptions: {
      external: Object.keys(globals),
      output: {
        globals,
        assetFileNames: (assetInfo) =>
          assetInfo.name && assetInfo.name.endsWith('.css') ? 'style.css' : 'assets/[name][extname]',
      },
    },
  },
})
