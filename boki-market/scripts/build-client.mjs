#!/usr/bin/env node
/**
 * 逐个构建插件前端（boki-market）。
 *
 * 只处理包含 client/index.ts 的插件；产物输出到插件自己的 client 目录，
 * 随安装流程复制到 backend/data/plugins。
 *
 * 注意：boki-market 自身没有 node_modules，vite / @vitejs/plugin-vue
 * 统一从 ../frontend/node_modules 解析（主仓库 frontend）。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '..') // boki-market/
const repoRoot = resolve(projectRoot, '..') // 主仓库 financial/
const pluginsRoot = resolve(projectRoot, 'plugins')
const viteBin = resolve(repoRoot, 'frontend/node_modules/vite/bin/vite.js')
const config = resolve(projectRoot, 'vite.plugin.config.mjs')

if (!existsSync(viteBin)) {
  console.error('未找到 Vite，请先在 frontend 执行 npm install')
  process.exit(1)
}
if (!existsSync(pluginsRoot)) {
  console.log('boki-market/plugins 不存在，跳过前端插件构建')
  process.exit(0)
}

const dirs = readdirSync(pluginsRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort((a, b) => a.localeCompare(b))

let built = 0
for (const id of dirs) {
  const entry = join(pluginsRoot, id, 'client', 'index.ts')
  if (!existsSync(entry)) continue
  console.log(`\n> 构建插件前端 ${id}`)
  const result = spawnSync(process.execPath, [viteBin, 'build', '--config', config], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, BOKI_PLUGIN_ID: id },
  })
  if (result.status !== 0) process.exit(result.status ?? 1)

  // 样式产物必须由 manifest 声明，否则前端运行时不会注入，页面会样式错乱
  const styleFile = join(pluginsRoot, id, 'client', 'style.css')
  if (existsSync(styleFile)) {
    let declared = ''
    try {
      const manifest = JSON.parse(readFileSync(join(pluginsRoot, id, 'manifest.json'), 'utf8'))
      declared = manifest?.contributes?.style ?? ''
    } catch {
      declared = ''
    }
    if (declared !== 'client/style.css') {
      console.warn(
        `  ⚠ 插件 ${id} 产出了 client/style.css，但 manifest.contributes.style=` +
          `${declared ? '"' + declared + '"' : '未声明'}，前端不会加载该样式。` +
          '请在 manifest.json 的 contributes 中加入 "style": "client/style.css"。',
      )
    }
  }

  built += 1
}

console.log(`\n插件前端构建完成，共 ${built} 个`)
