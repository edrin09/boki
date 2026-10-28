/**
 * Ed25519 detached 签名校验（服务端只验、不签）
 *
 * 公钥支持两种写法：
 *   1) raw 32 字节的 base64（推荐，MARKET_PUBLIC_KEYS 用这个）
 *   2) PEM（-----BEGIN PUBLIC KEY-----）
 * 私钥永远不进入本服务：服务器被入侵也伪造不出新索引 / 新包。
 */
import crypto from 'node:crypto'

// Ed25519 raw public key 转 SPKI DER 的固定前缀
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

function toPublicKey(material) {
  if (typeof material !== 'string' || !material.trim()) throw new Error('公钥为空')
  const value = material.trim()
  if (value.includes('BEGIN PUBLIC KEY')) return crypto.createPublicKey(value)

  const raw = Buffer.from(value, 'base64')
  if (raw.length === 32) {
    const der = Buffer.concat([ED25519_SPKI_PREFIX, raw])
    return crypto.createPublicKey({ key: der, format: 'der', type: 'spki' })
  }
  return crypto.createPublicKey({ key: raw, format: 'der', type: 'spki' })
}

function decodeSignature(signature) {
  if (typeof signature !== 'string' || !signature.trim()) throw new Error('签名为空')
  const value = signature.trim()
  return Buffer.from(value, /[-_]/.test(value) ? 'base64url' : 'base64')
}

/**
 * @param {Buffer|string} payload     被签名的原始字节（索引快照 JSON 原文）
 * @param {string} signature          base64 / base64url 签名
 * @param {string} publicKeyMaterial  raw base64 或 PEM
 * @returns {boolean}                 签名无效 / 长度不符返回 false；公钥本身非法抛错
 */
export function verifyDetachedSignature(payload, signature, publicKeyMaterial) {
  const key = toPublicKey(publicKeyMaterial)
  const signatureBytes = decodeSignature(signature)
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8')
  try {
    return crypto.verify(null, data, key, signatureBytes)
  } catch {
    return false
  }
}
