/**
 * 配置加载：所有环境变量在这里一次性解析、校验、定型。
 * 其他模块只接收 config 对象，不直接读 process.env，便于测试注入。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

const PACKAGE_VERSION = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')).version
const LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error', 'silent'])

function fail(message) {
  throw new Error(`配置错误：${message}`)
}

function boolFrom(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function intFrom(value, fallback, name, min, max) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    fail(`${name} 必须是 ${min}..${max} 的整数，当前为 ${JSON.stringify(value)}`)
  }
  return parsed
}

function resolveFromRoot(value) {
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(PROJECT_ROOT, value)
}

/** `keyId1:<base64>,keyId2:<base64>` → Map<keyId, base64> */
function parsePublicKeys(raw) {
  const keys = new Map()
  for (const item of String(raw ?? '').split(',')) {
    const entry = item.trim()
    if (!entry) continue
    const index = entry.indexOf(':')
    if (index <= 0) fail('MARKET_PUBLIC_KEYS 格式应为 keyId:<base64>[,keyId:<base64>]')
    const keyId = entry.slice(0, index).trim()
    const value = entry.slice(index + 1).trim()
    if (!/^[A-Za-z0-9._-]+$/.test(keyId)) fail(`MARKET_PUBLIC_KEYS 的 keyId 非法：${keyId}`)
    if (!value) fail(`MARKET_PUBLIC_KEYS 中 ${keyId} 的公钥为空`)
    keys.set(keyId, value)
  }
  return keys
}

function stripUndefined(overrides) {
  const out = {}
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (value !== undefined) out[key] = value
  }
  return out
}

export function loadConfig(overrides = {}) {
  const env = { ...process.env, ...stripUndefined(overrides) }
  const nodeEnv = env.NODE_ENV || 'development'

  const host = env.MARKET_HOST || '127.0.0.1'
  const port = intFrom(env.MARKET_PORT, 8789, 'MARKET_PORT', 0, 65535)
  const defaultBaseUrl = `http://${host === '0.0.0.0' || host === '::' ? 'localhost' : host}:${port}`
  const publicBaseUrl = String(env.MARKET_PUBLIC_BASE_URL || defaultBaseUrl).replace(/\/+$/, '')

  const requireHttps = boolFrom(env.MARKET_REQUIRE_HTTPS, nodeEnv === 'production')
  if (requireHttps && !publicBaseUrl.startsWith('https://')) {
    fail('MARKET_REQUIRE_HTTPS=true 时 MARKET_PUBLIC_BASE_URL 必须以 https:// 开头')
  }

  const logLevel = String(env.MARKET_LOG_LEVEL || 'info').toLowerCase()
  if (!LOG_LEVELS.has(logLevel)) fail(`MARKET_LOG_LEVEL 必须是 ${[...LOG_LEVELS].join(' / ')}`)

  const marketName = String(env.MARKET_NAME || 'boki-official').trim()
  if (!/^[A-Za-z0-9._-]{3,64}$/.test(marketName)) {
    fail('MARKET_NAME 必须是 3..64 位字母、数字、点、下划线或连字符')
  }

  return {
    nodeEnv,
    serviceVersion: PACKAGE_VERSION,
    marketName,
    host,
    port,
    publicBaseUrl,
    dbFile: resolveFromRoot(env.MARKET_DB_FILE || './db/market.db'),
    dataDir: resolveFromRoot(env.MARKET_DATA_DIR || './data'),
    licenseSecret: String(env.MARKET_LICENSE_SECRET || ''),
    ipHashSalt: String(env.MARKET_IP_HASH_SALT || ''),
    publicKeys: parsePublicKeys(env.MARKET_PUBLIC_KEYS || ''),
    rateLimit: intFrom(env.MARKET_RATE_LIMIT, 120, 'MARKET_RATE_LIMIT', 0, 1_000_000),
    maxUploadBytes: intFrom(
      env.MARKET_MAX_UPLOAD_BYTES,
      64 * 1024 * 1024,
      'MARKET_MAX_UPLOAD_BYTES',
      1024,
      1024 * 1024 * 1024,
    ),
    statsFlushMs: intFrom(env.MARKET_STATS_FLUSH_MS, 1000, 'MARKET_STATS_FLUSH_MS', 10, 60_000),
    statsBatchSize: intFrom(env.MARKET_STATS_BATCH_SIZE, 50, 'MARKET_STATS_BATCH_SIZE', 1, 10_000),
    trustProxy: boolFrom(env.MARKET_TRUST_PROXY, false),
    requireHttps,
    logLevel,
  }
}
