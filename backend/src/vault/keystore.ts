/**
 * 密钥保管器（模块级单例，**不依赖 Nest**）。
 *
 * `config/database.config.ts` 的 `prepareDatabase` 是**同步**的，
 * 而建库发生在 Nest 容器建立之前 —— 所以密钥只能放在模块级单例里，
 * 由 `main.ts` 在连库前写入。
 *
 * 生命周期：
 * - 未加密库：始终为空，`getBootKeyHex()` 返回 null → 走明文路径。
 * - 加密库：解锁成功后写入；锁定时清空。
 */
import { deriveSubKey, INFO_ATTACHMENT, INFO_DB } from '../sdk/vault-kdf'

/** 主密钥（MK），只在内存中存在，从不落盘 */
let masterKey: Buffer | null = null
/** 库密钥（HKDF 派生），供 `PRAGMA key` 使用 */
let dbKeyHex: string | null = null
/** 附件密钥（HKDF 派生），供 AES-256-GCM 使用 */
let attachmentKey: Buffer | null = null
/** 当前库是否已启用加密（由 vault.json 决定） */
let vaultEnabled = false
/** 最后一次鉴权活动时间（闲置锁定计时用） */
let lastActivityAt = Date.now()

/** 记录一次鉴权活动 */
export function touchActivity(): void {
  lastActivityAt = Date.now()
}

/** 读取最后一次活动时间 */
export function getLastActivityAt(): number {
  return lastActivityAt
}

/** 设置主密钥；传 null 表示清除（锁定） */
export function setMasterKey(mk: Buffer | null): void {
  if (!mk) {
    clearMasterKey()
    return
  }
  masterKey = Buffer.from(mk)
  dbKeyHex = deriveSubKey(masterKey, INFO_DB).toString('hex')
  attachmentKey = deriveSubKey(masterKey, INFO_ATTACHMENT)
}

/** 兼容别名：语义上「设置启动密钥」 */
export const setBootKey = setMasterKey

/** 清除主密钥（锁定） */
export function clearMasterKey(): void {
  masterKey = null
  dbKeyHex = null
  attachmentKey = null
}

/** 读取主密钥 */
export function getMasterKey(): Buffer | null {
  return masterKey
}

/**
 * 供 `prepareDatabase` 同步读取的库密钥（hex）。
 *
 * null 表示明文库。
 */
export function getBootKeyHex(): string | null {
  return dbKeyHex
}

/** 附件密钥 */
export function getAttachmentKey(): Buffer | null {
  return attachmentKey
}

/** 标记当前库是否启用加密 */
export function setVaultEnabled(value: boolean): void {
  vaultEnabled = value
}

/** 当前库是否启用加密 */
export function isVaultEnabledState(): boolean {
  return vaultEnabled
}

/**
 * 是否处于「已加密但未解锁」状态。
 *
 * 全局守卫据此返回 423（数据已锁定）。
 */
export function isVaultLocked(): boolean {
  return vaultEnabled && !masterKey
}
