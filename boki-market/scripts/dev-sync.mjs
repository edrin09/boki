#!/usr/bin/env node
/**
 * 开发期同步（boki-market）：把 plugins/<id> 的构建产物复制到安装/运行目录。
 *
 * 默认目标：backend/data/plugins/<id>（主仓库后端插件运行目录），
 * 与 PluginsService.copyPlugin 保持相同的排除规则（源码/映射/依赖目录）。
 * 正式安装仍应通过插件市场页或 /api/market/plugins/:id/install。
 *
 * 用法：
 *   node boki-market/scripts/dev-sync.mjs            # 同步所有已安装插件
 *   node boki-market/scripts/dev-sync.mjs banks      # 只同步指定插件
 *   BOKI_PLUGIN_TARGET=/path/to/dir node ... dev-sync.mjs  # 自定义目标目录
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, '..') // boki-market/
const repoRoot = path.resolve(projectRoot, '..') // 主仓库 financial/
const sourceRoot = path.join(projectRoot, 'plugins')
const targetRoot = process.env.BOKI_PLUGIN_TARGET
  ? path.resolve(process.env.BOKI_PLUGIN_TARGET)
  : path.join(repoRoot, 'backend/data/plugins')

const skipDir = new Set(['node_modules', '.git', '.turbo', 'coverage'])
const skipExt = new Set(['.ts', '.map', '.tsbuildinfo', '.vue'])

function copyPlugin(source, target) {
  if (!fs.existsSync(source)) throw new Error(`插件源目录不存在：${source}`)
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true })
  fs.mkdirSync(target, { recursive: true })

  const walk = (from, to) => {
    for (const dirent of fs.readdirSync(from, { withFileTypes: true })) {
      if (dirent.name.startsWith('.') && dirent.name !== '.env.example') continue
      const src = path.join(from, dirent.name)
      const dest = path.join(to, dirent.name)
      if (dirent.isDirectory()) {
        if (skipDir.has(dirent.name)) continue
        fs.mkdirSync(dest, { recursive: true })
        walk(src, dest)
      } else {
        if (skipExt.has(path.extname(dirent.name))) continue
        if (dirent.name === 'tsconfig.json') continue
        fs.copyFileSync(src, dest)
      }
    }
  }
  walk(source, target)
}

if (!fs.existsSync(sourceRoot)) {
  console.error(`插件源目录不存在：${sourceRoot}`)
  process.exit(1)
}

const requested = process.argv.slice(2)
const enabled = requested.length
  ? requested
  : fs
      .readdirSync(sourceRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((id) => fs.existsSync(path.join(targetRoot, id)))

if (!enabled.length) {
  console.log('没有可同步的插件')
  process.exit(0)
}

for (const id of enabled) {
  const source = path.join(sourceRoot, id)
  const target = path.join(targetRoot, id)
  if (!fs.existsSync(path.join(source, 'manifest.json'))) {
    console.warn(`跳过 ${id}：缺少 manifest.json`)
    continue
  }
  copyPlugin(source, target)
  console.log(`已同步插件 ${id} -> ${target}`)
}

console.log('开发同步完成。若后端正在运行，请重启后再验证。')
