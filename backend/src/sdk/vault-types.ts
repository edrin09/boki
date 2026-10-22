/**
 * Vault 公开数据类型（内核 → 插件的唯一契约面）。
 *
 * 单独成文件是为了打破 `vault.ts` ↔ `vault-kdf.ts` 的循环依赖：
 * 类型定义无运行时副作用，可以被安全地互相引用。
 *
 * ⚠️ 本模块**不得 import 任何 @nestjs/**。
 */

/** scrypt 参数集 */
export interface VaultKdfParams {
  algo: 'scrypt'
  /** CPU/内存成本因子 */
  N: number
  /** 块大小 */
  r: number
  /** 并行度 */
  p: number
  /** 派生密钥长度（字节） */
  keylen: number
  /** 随机盐（hex） */
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

/** AES-256-GCM 包装块（只含密文，不含明文密钥） */
export interface VaultKeyWrap {
  algo: 'aes-256-gcm'
  /** 初始化向量（hex，12 字节） */
  iv: string
  /** 认证标签（hex，16 字节） */
  tag: string
  /** 密文（hex） */
  ciphertext: string
}

/** 恢复码配置 */
export interface VaultRecoveryMeta {
  /** 是否已生成恢复码 */
  enabled: boolean
  /** 生成时间 */
  createdAt?: string
  /** 恢复码自身的 KDF 参数 */
  kdf?: VaultKdfParams
  /** 用恢复码派生的 KEK 包装的 MK */
  wrap?: VaultKeyWrap
}

/** 附件加密状态 */
export interface VaultAttachmentMeta {
  enabled: boolean
  /** 历史附件批量加密完成时间 */
  encryptedAt?: string
  /** 已加密的附件数量 */
  count?: number
}

/**
 * `data/vault.json` 的内容。
 *
 * 该文件**不加密**：它必须可读，否则无法知道「这个库是加密的」。
 * 其中不保存任何明文密钥材料，只保存盐、参数、校验块与 MK 的密文包装。
 */
export interface VaultMeta {
  /** 元数据版本 */
  version: 1
  /**
   * 加密状态：
   * - 文件不存在 → 未启用加密（明文库）
   * - `'migrating'` → 迁移进行中（崩溃恢复用，拒绝正常启动）
   * - `true` → 已加密
   */
  enabled: boolean | 'migrating'
  /** 使用的 provider id */
  provider: string
  /** 库加密参数 */
  cipher: VaultCipherParams
  /** 主密码的 KDF 参数 */
  kdf: VaultKdfParams
  /** 校验块：用于区分「密码错」与「文件坏」 */
  verifier: string
  /** 创建时间 */
  createdAt: string
  /** 主密码轮换记录 */
  rotation?: { at: string; count: number }
  /** 恢复码 */
  recovery?: VaultRecoveryMeta
  /**
   * 主密码 KEK 包装的 MK。
   *
   * 缺失表示旧格式（MK = scrypt(secret)），仍被兼容读取。
   */
  keyWrap?: VaultKeyWrap
  /** 附件加密状态 */
  attachments?: VaultAttachmentMeta
}

/**
 * Vault Provider 契约：插件实现此接口并在 `server/index.js` 顶层注册。
 *
 * ⚠️ 实现方**不得**依赖 Nest 容器：注册发生在 DI 建立之前。
 */
export interface VaultProvider {
  /** provider id，与 `vault.json.provider` 对应 */
  id: string
  /** 读取元数据 */
  readMeta(vaultFile: string): VaultMeta | null
  /** 写入元数据（必须原子写：先写 .tmp 再 rename） */
  writeMeta(vaultFile: string, meta: VaultMeta): void
  /** 同步：由口令派生主密钥 MK */
  deriveKey(secret: string, meta: VaultMeta): Buffer
  /** 同步：由恢复码派生主密钥 MK（可选实现） */
  deriveFromRecovery?(code: string, meta: VaultMeta): Buffer
}
