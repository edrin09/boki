/**
 * Vault 密钥派生原语（内核实现，插件复用）。
 *
 * ⚠️ 本模块**不得 import 任何 @nestjs/**：它要在 DI 容器建立之前被调用。
 *
 * 密钥体系（§4.1 的落地版，采用「随机 MK + 包装」结构）：
 *
 * ```text
 * MK (Master Key, 32B 随机)          ← 生成后永不以明文落盘
 *   ├─ HKDF-SHA256(salt="boki/vault/v1", info="boki/db/v1")          → dbKey   → PRAGMA key
 *   ├─ HKDF-SHA256(salt="boki/vault/v1", info="boki/attachment/v1")  → attKey  → AES-256-GCM
 *   └─ HKDF-SHA256(salt="boki/vault/v1", info="boki/verify/v1")      → verKey  → HMAC 校验块
 *
 * 主密码   ──scrypt(salt_pw)──▶ KEK_pw ──AES-256-GCM 解包──▶ MK
 * 恢复码   ──scrypt(salt_rc)──▶ KEK_rc ──AES-256-GCM 解包──▶ MK
 * ```
 *
 * 为什么不用「MK = scrypt(主密码)」：
 *   1. 改主密码只需重新包装 MK，**不必 PRAGMA rekey 全库重加密**，
 *      附件密钥也不变（否则历史附件会全部无法解密）；
 *   2. 恢复码才能在「忘记主密码」时派生出**同一个** MK（§4.4 的硬要求）。
 *   旧格式（MK = scrypt(secret)，无 keyWrap）仍被支持，见 deriveKey。
 */
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'
import type { VaultKdfParams, VaultKeyWrap } from './vault-types'

/** HKDF 固定盐（所有子密钥共用，靠 info 做域分离） */
export const HKDF_SALT = 'boki/vault/v1'

/** 子密钥用途标签 */
export const INFO_DB = 'boki/db/v1'
export const INFO_ATTACHMENT = 'boki/attachment/v1'
export const INFO_VERIFY = 'boki/verify/v1'
export const INFO_KEK_PASSWORD = 'boki/kek/password/v1'
export const INFO_KEK_RECOVERY = 'boki/kek/recovery/v1'

/** 校验块消息常量 */
export const VERIFIER_MESSAGE = 'boki-vault-v1'

/** 默认 KDF 参数：N=32768 单核约 100~250ms，内存 32MB */
export const DEFAULT_KDF: Omit<VaultKdfParams, 'salt'> = {
  algo: 'scrypt',
  N: 32768,
  r: 8,
  p: 1,
  keylen: 32,
}

/** 恢复码字符集（RFC 4648 Base32，去掉易混淆的 I/O/1/0） */
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
/** 128 bit 随机码的 Base32 长度（128 / 5 = 25.6 → 26） */
export const RECOVERY_CODE_LENGTH = 26

/** 生成随机盐（32 字节 → 64 位 hex） */
export function newSalt(): string {
  return randomBytes(32).toString('hex')
}

/**
 * scrypt 内存上限。
 *
 * ⚠️ Node 的 scryptSync 默认 maxmem 只有 32MB，而 N=32768,r=8 需要 33.5MB，
 * 不显式传 maxmem 会抛 ERR_CRYPTO_INVALID_SCRYPT_PARAMS。
 */
export function scryptMaxmem(kdf: VaultKdfParams): number {
  return 128 * kdf.N * kdf.r * 2
}

/** 主密码 / 恢复码统一做 NFKC 规范化，避免不同输入法产生不同密钥 */
export function normalizeSecret(secret: string): string {
  return secret.normalize('NFKC')
}

/**
 * 旧格式的主密钥派生：MK = scrypt(secret, salt)。
 *
 * @deprecated 新格式请用 deriveKek + 解包；此函数仅用于兼容旧 vault.json。
 */
export function deriveMasterKey(secret: string, kdf: VaultKdfParams): Buffer {
  return scryptSync(normalizeSecret(secret), Buffer.from(kdf.salt, 'hex'), kdf.keylen, {
    N: kdf.N,
    r: kdf.r,
    p: kdf.p,
    maxmem: scryptMaxmem(kdf),
  })
}

/** HKDF-SHA256 子密钥派生 */
export function deriveSubKey(mk: Buffer, info: string): Buffer {
  return Buffer.from(hkdfSync('sha256', mk, Buffer.from(HKDF_SALT), Buffer.from(info), 32))
}

/**
 * 密钥加密密钥（KEK）：scrypt 拉高离线爆破成本，HKDF 做域分离。
 *
 * KEK 与 MK 分离后，同一主密码在不同用途下不会产生相关密钥。
 */
export function deriveKek(secret: string, kdf: VaultKdfParams, info: string): Buffer {
  const base = deriveMasterKey(secret, kdf)
  return deriveSubKey(base, info)
}

/** 生成校验块：HMAC-SHA256(verKey, 'boki-vault-v1') */
export function makeVerifier(mk: Buffer): string {
  return createHmac('sha256', deriveSubKey(mk, INFO_VERIFY)).update(VERIFIER_MESSAGE).digest('hex')
}

/** 恒定时间比较校验块 */
export function checkVerifier(mk: Buffer, expected: string): boolean {
  if (!expected) return false
  const actual = Buffer.from(makeVerifier(mk), 'hex')
  const want = Buffer.from(expected, 'hex')
  return actual.length === want.length && timingSafeEqual(actual, want)
}

/** 用 KEK 包装 MK（输出只含密文） */
export function wrapKey(mk: Buffer, kek: Buffer): VaultKeyWrap {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', kek, iv)
  const ciphertext = Buffer.concat([cipher.update(mk), cipher.final()])
  return {
    algo: 'aes-256-gcm',
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    ciphertext: ciphertext.toString('hex'),
  }
}

/**
 * 解包 MK。
 *
 * @returns 密码错误时返回 null（不是抛错），便于区分「密码错」与「文件损坏」
 */
export function unwrapKey(wrap: VaultKeyWrap | undefined | null, kek: Buffer): Buffer | null {
  if (!wrap || wrap.algo !== 'aes-256-gcm') return null
  try {
    const iv = Buffer.from(wrap.iv, 'hex')
    const tag = Buffer.from(wrap.tag, 'hex')
    const data = Buffer.from(wrap.ciphertext, 'hex')
    const decipher = createDecipheriv('aes-256-gcm', kek, iv)
    decipher.setAuthTag(tag)
    const out = Buffer.concat([decipher.update(data), decipher.final()])
    return out.length === 32 ? out : null
  } catch {
    return null
  }
}

/** 生成 128 bit 恢复码（Base32，26 字符，无分隔符） */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(16)
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += RECOVERY_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += RECOVERY_ALPHABET[(value << (5 - bits)) & 31]
  return out.slice(0, RECOVERY_CODE_LENGTH)
}

/** 恢复码归一化：去分隔符、去空白、转大写（用户可能从 txt 里带横线复制） */
export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase()
}

/** 恢复码展示格式：4 位一组，共 7 组 */
export function formatRecoveryCode(code: string): string {
  const clean = normalizeRecoveryCode(code)
  return clean.match(/.{1,4}/g)?.join('-') ?? clean
}

/** 恢复码合法性检查（长度 + 字符集） */
export function isValidRecoveryCode(code: string): boolean {
  const clean = normalizeRecoveryCode(code)
  if (clean.length !== RECOVERY_CODE_LENGTH) return false
  for (const ch of clean) {
    if (!RECOVERY_ALPHABET.includes(ch)) return false
  }
  return true
}
