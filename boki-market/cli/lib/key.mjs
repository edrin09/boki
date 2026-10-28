/**
 * Ed25519 发布密钥处理（只在 CLI 侧使用）。
 *
 * 私钥来源仅允许环境变量 PLUGIN_MARKET_PRIVATE_KEY（本地 / CI secret），
 * 支持三种常见格式，避免发布时因格式不对卡住：
 *   1) raw 32 字节 seed 的 base64 / base64url（libsodium、keygen 输出）
 *   2) PKCS#8 DER 的 base64
 *   3) PEM（PKCS#8 私钥 PEM 文本）
 *
 * 服务端 MARKET_PUBLIC_KEYS 使用「32 字节 raw 公钥 base64」，本模块可推导。
 */
import crypto from 'node:crypto'
import { CliError, usageError } from './errors.mjs'

// Ed25519 PKCS#8 固定前缀：seed（32 字节）前加上即可生成合法 DER
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')
// Ed25519 SPKI DER 长度固定 44 字节，最后 32 字节是 raw 公钥
const ED25519_RAW_KEY_BYTES = 32

function decodeBase64(value) {
  const normalized = value.replace(/\s+/g, '')
  const buffer = Buffer.from(normalized, /[-_]/.test(normalized) ? 'base64url' : 'base64')
  if (!buffer.length) throw new CliError('私钥 base64 解码为空')
  return buffer
}

/**
 * @param {string} material PLUGIN_MARKET_PRIVATE_KEY 的值
 * @returns {crypto.KeyObject}
 */
export function loadPrivateKey(material) {
  const value = String(material ?? '').trim()
  if (!value) {
    throw new CliError(
      '未配置签名私钥：设置环境变量 PLUGIN_MARKET_PRIVATE_KEY（仅本地 / CI，服务器永不持有）',
    )
  }

  let key
  try {
    if (value.includes('BEGIN PRIVATE KEY')) {
      key = crypto.createPrivateKey(value)
    } else {
      const raw = decodeBase64(value)
      if (raw.length === ED25519_RAW_KEY_BYTES) {
        const der = Buffer.concat([ED25519_PKCS8_PREFIX, raw])
        key = crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' })
      } else {
        key = crypto.createPrivateKey({ key: raw, format: 'der', type: 'pkcs8' })
      }
    }
  } catch (error) {
    throw new CliError(
      `无法解析 PLUGIN_MARKET_PRIVATE_KEY：${error.message}（支持 raw seed base64 / PKCS#8 DER base64 / PKCS#8 PEM）`,
    )
  }

  if (key.asymmetricKeyType !== 'ed25519') {
    throw new CliError(`私钥类型必须是 Ed25519，当前为 ${key.asymmetricKeyType || 'unknown'}`)
  }
  return key
}

/** raw 32 字节公钥 base64（可直接填入服务端 MARKET_PUBLIC_KEYS） */
export function publicKeyBase64(key) {
  const publicKey = key.type === 'private' ? crypto.createPublicKey(key) : key
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new CliError('公钥类型必须是 Ed25519')
  }
  const der = publicKey.export({ type: 'spki', format: 'der' })
  return der.subarray(der.length - ED25519_RAW_KEY_BYTES).toString('base64')
}

export function signPayload(key, payload) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8')
  return crypto.sign(null, data, key).toString('base64')
}

/** 公钥指纹（便于在服务器 / 客户端比对同一把密钥） */
export function publicKeyFingerprint(publicBase64) {
  return crypto.createHash('sha256').update(publicBase64, 'utf8').digest('hex').slice(0, 16)
}

/**
 * 生成新密钥对。私钥以 raw seed base64 返回；写入文件时只写这一行。
 * 不把私钥打到 stdout（只输出路径、公钥与指纹）。
 */
export function generateKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
  const der = privateKey.export({ type: 'pkcs8', format: 'der' })
  const seedBase64 = der.subarray(der.length - ED25519_RAW_KEY_BYTES).toString('base64')
  const publicBase64 = publicKeyBase64(publicKey)
  return {
    seedBase64,
    publicKeyBase64: publicBase64,
    fingerprint: publicKeyFingerprint(publicBase64),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  }
}

/** 命令层统一入口：校验 keyId 可用（服务端要求 ^[A-Za-z0-9._-]+$） */
export function normalizeKeyId(value) {
  const keyId = String(value ?? '').trim() || 'key-1'
  if (!/^[A-Za-z0-9._-]+$/.test(keyId)) {
    throw usageError(`keyId 非法：${keyId}（只允许字母、数字、点、下划线、连字符）`)
  }
  return keyId
}
