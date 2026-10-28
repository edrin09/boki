/**
 * 发布端配置（开发机 / CI）。
 *
 * 与 server/src/lib/config.mjs 的区别：
 *   - 这里可以读 PLUGIN_MARKET_PRIVATE_KEY（服务端绝对不允许）；
 *   - 服务地址默认取 MARKET_URL，兼容 MARKET_ADMIN_URL / MARKET_PUBLIC_BASE_URL；
 *   - 其余路径相对 boki-market/ 解析。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { usageError } from './errors.mjs'

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const PACKAGE_VERSION = JSON.parse(
  fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'),
).version

const URL_ENV_KEYS = ['MARKET_URL', 'MARKET_ADMIN_URL', 'MARKET_PUBLIC_BASE_URL']

function normalizeUrl(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return ''
  let url
  try {
    url = new URL(value)
  } catch {
    throw usageError(`市场地址不是合法 URL：${value}`)
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw usageError(`市场地址只允许 http/https：${value}`)
  }
  return url.toString().replace(/\/+$/, '')
}

function firstEnv(env, keys) {
  for (const key of keys) {
    if (env[key] && String(env[key]).trim()) return String(env[key]).trim()
  }
  return ''
}

function resolveFromRoot(value) {
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(PROJECT_ROOT, value)
}

/**
 * @param {Record<string, string|boolean>} flags 已解析的命令行选项
 * @param {NodeJS.ProcessEnv} [env]
 */
export function loadCliConfig(flags = {}, env = process.env) {
  const urlFlag = typeof flags.url === 'string' ? flags.url : ''
  const marketUrl = normalizeUrl(urlFlag || firstEnv(env, URL_ENV_KEYS))

  const keyId = (typeof flags['key-id'] === 'string' ? flags['key-id'] : '') ||
    (env.PLUGIN_MARKET_KEY_ID || '').trim() ||
    'key-1'

  const timeoutFlag = typeof flags.timeout === 'string' ? Number(flags.timeout) : 60
  if (!Number.isFinite(timeoutFlag) || timeoutFlag <= 0 || timeoutFlag > 3600) {
    throw usageError('--timeout 必须是 1..3600 之间的秒数')
  }

  return {
    marketUrl,
    keyId,
    timeoutMs: Math.round(timeoutFlag * 1000),
    privateKey: String(env.PLUGIN_MARKET_PRIVATE_KEY || '').trim(),
    pluginRoot: resolveFromRoot((typeof flags['plugin-root'] === 'string' && flags['plugin-root']) || env.PLUGIN_MARKET_PLUGIN_ROOT || 'plugins'),
    distDir: resolveFromRoot((typeof flags['dist-dir'] === 'string' && flags['dist-dir']) || env.PLUGIN_MARKET_DIST_DIR || 'dist'),
    json: flags.json === true,
    env,
  }
}

/** 需要访问市场接口的命令统一在这里检查，避免报错晚于打包 */
export function requireMarket(config) {
  if (!config.marketUrl) {
    throw usageError('缺少市场地址：设置 MARKET_URL（或 MARKET_ADMIN_URL）或传 --url')
  }
}

export function requireMarketUrl(config) {
  if (!config.marketUrl) {
    throw usageError('缺少市场地址：设置 MARKET_URL（或 MARKET_ADMIN_URL）或传 --url')
  }
}
