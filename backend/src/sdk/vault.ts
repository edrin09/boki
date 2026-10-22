/**
 * Vault 公开契约 —— 插件接入加密能力的**唯一入口**。
 *
 * ⚠️ 本模块**不允许 import 任何 @nestjs/**：
 * 它要在 DI 容器存在之前被调用（`main.ts` 连库前就要决定用不用密钥）。
 *
 * 设计要点：
 * 1. **静态注册表**：插件在 `server/index.js` 顶层调用 `registerVaultProvider()`，
 *    此时 Nest 容器还不存在，但模块作用域已经可用（见 plugin.loader 的 requireEntry）。
 * 2. **内核兜底 provider**：内核自带一个基于 `sdk/vault-kdf` 的标准实现，
 *    保证「拔掉 vault 插件后仍能解锁并记账」（硬约束 1）。
 *    插件注册同名 provider 时会覆盖它，两者派生结果完全一致。
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  INFO_KEK_PASSWORD,
  INFO_KEK_RECOVERY,
  checkVerifier,
  deriveKek,
  deriveMasterKey,
  normalizeRecoveryCode,
  unwrapKey,
} from './vault-kdf'
import type {
  VaultCipherParams,
  VaultKdfParams,
  VaultKeyWrap,
  VaultMeta,
  VaultProvider,
  VaultRecoveryMeta,
} from './vault-types'

export type {
  VaultCipherParams,
  VaultKdfParams,
  VaultKeyWrap,
  VaultMeta,
  VaultProvider,
  VaultRecoveryMeta,
}

/** 内核兜底 provider 的 id（与插件 provider 同名，便于互相覆盖） */
export const CORE_VAULT_PROVIDER_ID = 'vault'

/** 默认库加密参数 */
export const DEFAULT_CIPHER_PARAMS: VaultCipherParams = {
  name: 'sqlcipher',
  legacy: 4,
  memorySecurity: true,
}

// ==================== 注册表 ====================

const registry = new Map<string, VaultProvider>()

/**
 * 注册 Vault Provider。
 *
 * 同 id 后注册者覆盖先注册者：插件 provider 会覆盖内核兜底 provider。
 */
export function registerVaultProvider(provider: VaultProvider): void {
  if (!provider?.id) throw new Error('VaultProvider 必须有 id')
  registry.set(provider.id, provider)
}

/** 注销 provider（测试用） */
export function unregisterVaultProvider(id: string): void {
  registry.delete(id)
}

/** 列出已注册的 provider id */
export function listVaultProviderIds(): string[] {
  return [...registry.keys()]
}

/**
 * 解析 meta 对应的 provider。
 *
 * 严格按 `meta.provider` 匹配，**不做**「随便挑一个」的兜底 ——
 * 用错 provider 的 KDF 会派生出错误密钥，表现与「密码错」一样，极难排查。
 */
export function resolveVaultProvider(meta: VaultMeta | null): VaultProvider | null {
  if (!meta) return null
  return registry.get(meta.provider) ?? null
}

// ==================== vault.json 读写 ====================

/**
 * `vault.json` 的路径。
 *
 * 默认与数据库文件同目录（`data/vault.json`），可用 `VAULT_FILE` 覆盖。
 */
export function vaultFilePath(): string {
  const env = process.env.VAULT_FILE
  if (env) return path.isAbsolute(env) ? env : path.resolve(process.cwd(), env)
  const raw = process.env.DB_DATABASE || './data/financial.db'
  const db = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw)
  return path.join(path.dirname(db), 'vault.json')
}

/** 读取元数据；文件不存在或格式非法时返回 null */
export function readVaultMeta(): VaultMeta | null {
  return readVaultMetaFrom(vaultFilePath())
}

/** 从指定路径读取元数据 */
export function readVaultMetaFrom(file: string): VaultMeta | null {
  if (!fs.existsSync(file)) return null
  try {
    const meta = JSON.parse(fs.readFileSync(file, 'utf8')) as VaultMeta
    if (!meta || meta.version !== 1) return null
    if (typeof meta.enabled === 'boolean' || meta.enabled === 'migrating') return meta
    return null
  } catch {
    return null
  }
}

/**
 * 原子写入元数据：先写 `.tmp` 再 `rename`。
 *
 * 断电/崩溃时不会留下半截 JSON —— 否则系统会误判「未加密」而用明文方式
 * 去开一个密文库，SQLite 会报「file is not a database」，更糟的是
 * `synchronize` 可能尝试重建表，导致数据丢失。
 */
export function writeVaultMeta(meta: VaultMeta, file: string = vaultFilePath()): void {
  const provider = resolveVaultProvider(meta)
  if (provider) {
    provider.writeMeta(file, meta)
    return
  }
  writeVaultMetaAtomic(file, meta)
}

/** 不依赖 provider 的原子写实现 */
export function writeVaultMetaAtomic(file: string, meta: VaultMeta): void {
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
  fs.renameSync(tmp, file)
}

// ==================== 内核兜底 provider ====================

/**
 * 内核兜底 provider。
 *
 * 它保证：**vault 插件被停用、被卸载、甚至从未安装**时，
 * 已加密的库依然能解锁并记账（《插件开发与迁移指南》1.2 硬约束 1）。
 *
 * 插件注册的 provider 与它派生结果完全一致（插件只是转调 `sdk/vault-kdf`），
 * 因此插件在 / 不在，系统行为一致。
 */
export const coreVaultProvider: VaultProvider = {
  id: CORE_VAULT_PROVIDER_ID,

  readMeta(file: string): VaultMeta | null {
    return readVaultMetaFrom(file)
  },

  writeMeta(file: string, meta: VaultMeta): void {
    writeVaultMetaAtomic(file, meta)
  },

  /**
   * 由主密码派生 MK。
   *
   * - 新格式（有 keyWrap）：scrypt → KEK → AES-256-GCM 解包。密码错则**返回错误**。
   * - 旧格式（无 keyWrap）：MK = scrypt(secret)，密码错要靠 verifier 才能发现。
   */
  deriveKey(secret: string, meta: VaultMeta): Buffer {
    if (meta.keyWrap) {
      const kek = deriveKek(secret, meta.kdf, INFO_KEK_PASSWORD)
      const mk = unwrapKey(meta.keyWrap, kek)
      if (!mk) throw new Error('主密码错误')
      return mk
    }
    return deriveMasterKey(secret, meta.kdf)
  },

  /** 由恢复码派生 MK */
  deriveFromRecovery(code: string, meta: VaultMeta): Buffer {
    const recovery = meta.recovery
    if (!recovery?.enabled || !recovery.wrap || !recovery.kdf) {
      throw new Error('未启用恢复码')
    }
    const kek = deriveKek(normalizeRecoveryCode(code), recovery.kdf, INFO_KEK_RECOVERY)
    const mk = unwrapKey(recovery.wrap, kek)
    if (!mk) throw new Error('恢复码错误')
    return mk
  },
}

// 内核兜底 provider 默认注册（插件可覆盖）
registerVaultProvider(coreVaultProvider)

// ==================== 便捷判定 ====================

/** 加密是否已启用（含迁移中间态） */
export function isVaultEnabled(meta: VaultMeta | null = readVaultMeta()): boolean {
  return !!meta && meta.enabled !== false
}

/** 是否处于迁移中间态（崩溃恢复用） */
export function isVaultMigrating(meta: VaultMeta | null = readVaultMeta()): boolean {
  return meta?.enabled === 'migrating'
}

/** 校验块比对（口令/恢复码派生出的 MK 是否与元数据匹配） */
export { checkVerifier }
