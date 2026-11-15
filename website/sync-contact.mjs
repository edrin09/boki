#!/usr/bin/env node
/**
 * 官网联系信息同步：读取仓库根 .env 的应用身份与联系方式，
 * 生成 website/contact.js（window.BOKI_CONTACT），供 index.html 消费。
 *
 * 应用身份与联系方式的统一配置源是仓库根 .env：
 *   APP_TITLE / OFFICIAL_SITE / WINDOW_TITLE / PUBLISHER_NAME /
 *   CONTACT_EMAIL / CONTACT_PHONE / CONTACT_WECHAT
 * 修改后执行：node website/sync-contact.mjs，然后提交 website/contact.js。
 */
import { fileURLToPath } from 'node:url'
import * as fs from 'node:fs'
import * as path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const envPath = path.join(repoRoot, '.env')

if (!fs.existsSync(envPath)) {
  console.error(`[同步] 失败：缺少 ${envPath}（应用身份与联系方式的统一配置源）`)
  process.exit(1)
}

/** 解析 .env：KEY=VALUE，忽略空行与 # 注释，剥离成对引号 */
function loadEnvFile(file) {
  const env = {}
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}

const KEYS = [
  'APP_TITLE',
  'OFFICIAL_SITE',
  'WINDOW_TITLE',
  'PUBLISHER_NAME',
  'CONTACT_EMAIL',
  'CONTACT_PHONE',
  'CONTACT_WECHAT',
]

const env = loadEnvFile(envPath)
const missing = KEYS.filter((k) => !env[k])
if (missing.length > 0) {
  console.error(`[同步] 失败：根目录 .env 缺少 ${missing.join(', ')}`)
  process.exit(1)
}

const contact = {
  appTitle: env.APP_TITLE,
  officialSite: env.OFFICIAL_SITE,
  windowTitle: env.WINDOW_TITLE,
  publisher: env.PUBLISHER_NAME,
  email: env.CONTACT_EMAIL,
  phone: env.CONTACT_PHONE,
  wechat: env.CONTACT_WECHAT,
}

const out = [
  '// 由 website/sync-contact.mjs 依据仓库根 .env 自动生成，请勿手改',
  '// 改联系方式：编辑根目录 .env → node website/sync-contact.mjs',
  `window.BOKI_CONTACT = ${JSON.stringify(contact, null, 2)}`,
  '',
].join('\n')

const outPath = path.join(__dirname, 'contact.js')
fs.writeFileSync(outPath, out)
console.log(`[同步] website/contact.js 已生成（来源：根目录 .env）`)
console.log(`  发布者：${contact.publisher}`)
console.log(`  邮箱：${contact.email}  电话：${contact.phone}  微信：${contact.wechat}`)
console.log(`  官网：${contact.officialSite}`)
