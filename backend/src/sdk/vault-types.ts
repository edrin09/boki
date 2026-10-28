/**
 * Vault 公开数据类型。
 *
 * v2 起库密钥只来自程序根目录的 `vault.key`，不再由主密码派生；
 * 这里的 scrypt / 包装相关类型仅用于**只读识别旧版 vault.json** 并完成一次性转换。
 *
 * ⚠️ 本模块**不得 import 任何 @nestjs/**。
 */

/** 旧版 scrypt 参数集（仅升级转换读取） */
export interface VaultKdfParams {
  algo: 'scrypt'
  N: number
  r: number
  p: number
  keylen: number
  salt: string
}

/** 库加密参数 */
export interface VaultCipherParams {
  name: 'sqlcipher'
  /** SQLCipher 兼容版本 */
  legacy: number
  /** 是否开启内存擦除 */
  memorySecurity: boolean
}

/** AES-256-GCM 包装块（旧版元数据字段） */
export interface VaultKeyWrap {
  algo: 'aes-256-gcm'
  iv: string
  tag: string
  ciphertext: string
}

/** 旧版恢复码配置 */
export interface VaultRecoveryMeta {
  enabled: boolean
  createdAt?: string
  kdf?: VaultKdfParams
  wrap?: VaultKeyWrap
}

/** 附件加密状态 */
export interface VaultAttachmentMeta {
  enabled: boolean
  encryptedAt?: string
  count?: number
}

/**
 * `vault.json`（v2，密钥文件模式）的内容。
 *
 * 文件本身不加密：它必须可读，否则无法知道「这个库是加密的」。
 * 其中只保存校验块与加密参数，不含任何密钥材料 —— 密钥只在 `vault.key` 里。
 */
export interface VaultMeta {
  version: 2
  /**
   * 加密状态：
   * - `'migrating'` → 迁移进行中（崩溃恢复用，拒绝正常启动）
   * - `true` → 已加密
   */
  enabled: true | 'migrating'
  cipher: VaultCipherParams
  /** 校验块：用于确认 vault.key 是否与当前库匹配 */
  verifier: string
  createdAt: string
  attachments?: VaultAttachmentMeta
}

/**
 * 旧版 `vault.json`（主密码模式）。
 *
 * 只用于识别并转换，运行期不再写入此结构。
 */
export interface LegacyVaultMeta {
  version: 1
  enabled: boolean | 'migrating'
  provider: string
  cipher: VaultCipherParams
  kdf: VaultKdfParams
  verifier: string
  createdAt: string
  rotation?: { at: string; count: number }
  recovery?: VaultRecoveryMeta
  /** 缺失表示更旧的格式：MK = scrypt(secret) */
  keyWrap?: VaultKeyWrap
  attachments?: VaultAttachmentMeta
}

export type AnyVaultMeta = VaultMeta | LegacyVaultMeta
