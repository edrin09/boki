/**
 * 密钥保管器（模块级单例，**不依赖 Nest**）。
 *
 * `config/database.config.ts` 的 `prepareDatabase` 是**同步**的，
 * 而建库发生在 Nest 容器建立之前 —— 所以密钥只能放在模块级单例里，
 * 由 `main.ts` 在读到 `vault.key` 后写入。
 *
 * 生命周期：进程启动时写入，进程退出即消失；不存在「锁定」中间态。
 */
import { deriveSubKey, INFO_ATTACHMENT, INFO_DB } from '../sdk/vault-kdf'

/** 主密钥（MK），只在内存中存在，从不落盘 */
let masterKey: Buffer | null = null
/** 库密钥（HKDF 派生），供 `PRAGMA key` 使用 */
let dbKeyHex: string | null = null
/** 附件密钥（HKDF 派生），供 AES-256-GCM 使用 */
let attachmentKey: Buffer | null = null

/** 设置主密钥 */
export function setMasterKey(mk: Buffer): void {
  masterKey = Buffer.from(mk)
  dbKeyHex = deriveSubKey(masterKey, INFO_DB).toString('hex')
  attachmentKey = deriveSubKey(masterKey, INFO_ATTACHMENT)
}

/** 清除主密钥（仅测试 / 退出时使用） */
export function clearMasterKey(): void {
  masterKey = null
  dbKeyHex = null
  attachmentKey = null
}

/**
 * 供 `prepareDatabase` 同步读取的库密钥（hex）。
 *
 * null 表示明文库（仅 `DB_CIPHER=plain` 回归模式）。
 */
export function getBootKeyHex(): string | null {
  return dbKeyHex
}

/** 附件密钥 */
export function getAttachmentKey(): Buffer | null {
  return attachmentKey
}
