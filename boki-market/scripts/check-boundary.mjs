#!/usr/bin/env node
/**
 * 目录边界检查（npm run check）
 *
 * 三条硬规则：
 *   1. 服务端代码不得出现签名私钥 / 任何 PEM 私钥
 *   2. .env.example 不得包含 PLUGIN_MARKET_PRIVATE_KEY
 *   3. 服务端与 CLI 的相对导入不得越出 boki-market/（不得反向依赖 financial 主仓库）
 *
 * CLI 允许读取 PLUGIN_MARKET_PRIVATE_KEY（发布端），但源码里不得出现 PEM 私钥内容。
 *
 * 该脚本在独立仓库中运行，也在主仓库的 boki-market/ 目录下运行。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FORBIDDEN = [
  {
    pattern: /^\s*(?:export\s+)?PLUGIN_MARKET_PRIVATE_KEY\s*=/m,
    reason: '出现签名私钥配置项（私钥只能留在发布端）',
  },
  {
    pattern: /process\.env\.PLUGIN_MARKET_PRIVATE_KEY/,
    reason: '服务端读取了签名私钥环境变量（私钥只能留在发布端）',
  },
  { pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, reason: '出现 PEM 私钥内容' },
]

function walk(dir) {
  const files = []
  if (!fs.existsSync(dir)) return files
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'data' || entry.name === 'db') continue
      files.push(...walk(full))
    } else {
      files.push(full)
    }
  }
  return files
}

function isInside(parent, child) {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

const problems = []
const serverFiles = walk(path.join(ROOT, 'server'))
const cliFiles = walk(path.join(ROOT, 'cli'))
const checkFiles = [
  ...serverFiles,
  ...walk(path.join(ROOT, 'deploy')),
  path.join(ROOT, '.env.example'),
].filter((file) => fs.existsSync(file) && fs.statSync(file).isFile())

for (const file of checkFiles) {
  const content = fs.readFileSync(file, 'utf8')
  for (const rule of FORBIDDEN) {
    if (rule.pattern.test(content)) {
      problems.push(`${path.relative(ROOT, file)}：${rule.reason}`)
    }
  }
}

// CLI 允许读取 PLUGIN_MARKET_PRIVATE_KEY，但源码里不得出现任何真实的 PEM 私钥
const PEM_PRIVATE_KEY = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/
for (const file of cliFiles) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue
  if (PEM_PRIVATE_KEY.test(fs.readFileSync(file, 'utf8'))) {
    problems.push(`${path.relative(ROOT, file)}：CLI 源码中出现 PEM 私钥内容`)
  }
}

const importPattern = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g
for (const file of [...serverFiles, ...cliFiles]) {
  if (!file.endsWith('.mjs')) continue
  const content = fs.readFileSync(file, 'utf8')
  for (const match of content.matchAll(importPattern)) {
    const specifier = match[1]
    if (!specifier.startsWith('.')) continue
    const resolved = path.resolve(path.dirname(file), specifier)
    if (!isInside(ROOT, resolved)) {
      problems.push(`${path.relative(ROOT, file)}：导入越出项目边界 → ${specifier}`)
    }
  }
}

if (problems.length) {
  process.stderr.write('目录边界检查失败：\n')
  for (const problem of problems) process.stderr.write(`  - ${problem}\n`)
  process.exit(1)
}

process.stdout.write(
  `目录边界检查通过（${checkFiles.length + cliFiles.length} 个文件）：server/ 无私钥，CLI 无 PEM 私钥，导入未越出 boki-market/\n`,
)
