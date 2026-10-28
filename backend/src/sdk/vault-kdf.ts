/**
 * Vault 密钥派生原语（内核实现）。
 *
 * ⚠️ 本模块**不得 import 任何 @nestjs/**：它要在 DI 容器建立之前被调用。
 *
 * 密钥体系：
 *
 * ```text
 * MK (Master Key, 32B 随机)   ← 存放在程序根目录 vault.key（hex 文本）
 *   ├─ HKDF-SHA256(salt="boki/vault/v1", info="boki/db/v1")          → dbKey   → PRAGMA key
 *   ├─ HKDF-SHA256(salt="boki/vault/v1", info="boki/attachment/v1")  → attKey  → AES-256-GCM
 *   └─ HKDF-SHA256(salt="boki/vault/v1", info="boki/verify/v1")      → verKey  → HMAC 校验块
 * ```
 *
 * 旧版主密码/恢复码的 scrypt 派生已移到 `vault/vault-legacy.ts`，
 * 只在升级时读取一次旧 vault.json，运行期不再使用。
 */
import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto'

/** HKDF 固定盐（所有子密钥共用，靠 info 做域分离） */
export const HKDF_SALT = 'boki/vault/v1'

/** 子密钥用途标签 */
export const INFO_DB = 'boki/db/v1'
export const INFO_ATTACHMENT = 'boki/attachment/v1'
export const INFO_VERIFY = 'boki/verify/v1'

/** 校验块消息常量 */
export const VERIFIER_MESSAGE = 'boki-vault-v1'

/** HKDF-SHA256 子密钥派生 */
export function deriveSubKey(mk: Buffer, info: string): Buffer {
  return Buffer.from(hkdfSync('sha256', mk, Buffer.from(HKDF_SALT), Buffer.from(info), 32))
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
