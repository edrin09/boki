#!/usr/bin/env node
/**
 * 插件后端统一编译（boki-market）。
 *
 * 1. 先构建内核（主仓库 backend），生成 backend/dist 与 .d.ts（插件通过 @core/* 引用）
 * 2. 再用本项目的 tsconfig.json 编译所有插件 server 代码
 *
 * 产物与源码同目录（index.js），安装时由 PluginsService 复制到 data/plugins，
 * 或由 dev-sync.mjs 同步到目标目录（BOKI_PLUGIN_TARGET 可配置）。
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '..') // boki-market/
const repoRoot = resolve(projectRoot, '..') // 主仓库 financial/
const backendDir = resolve(repoRoot, 'backend')

function run(command, args, cwd) {
  console.log(`\n> ${command} ${args.join(' ')}  (${cwd})`)
  const useShell = process.platform === 'win32' && /\.cmd$/i.test(command)
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: useShell })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
run(npm, ['run', 'build'], backendDir)

const tsc = resolve(backendDir, 'node_modules/typescript/bin/tsc')
if (!existsSync(tsc)) {
  console.error('未找到 TypeScript，请先在 backend 执行 npm install')
  process.exit(1)
}
run(process.execPath, [tsc, '-p', resolve(projectRoot, 'tsconfig.json')], projectRoot)

console.log('\n插件后端编译完成')
