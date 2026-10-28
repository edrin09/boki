/**
 * Vault 公开契约 —— 加密元数据的读写入口。
 *
 * ⚠️ 本模块**不允许 import 任何 @nestjs/**：
 * 它要在 DI 容器存在之前被调用（`main.ts` 连库前就要决定用不用密钥）。
 *
 * 密钥文件模式下不存在 provider / 口令派生：MK 只来自 `vault.key`。
 * 旧版（version 1，主密码）元数据仍可被识别，用于一次性转换到密钥文件。
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { checkVerifier } from './vault-kdf'
import type {
  AnyVaultMeta,
  LegacyVaultMeta,
  VaultAttachmentMeta,
  VaultCipherParams,
  VaultKdfParams,
  VaultKeyWrap,
  VaultMeta,
  VaultRecoveryMeta,
} from './vault-types'

export type {
  AnyVaultMeta,
  LegacyVaultMeta,
  VaultAttachmentMeta,
  VaultCipherParams,
  VaultKdfParams,
  VaultKeyWrap,
  VaultMeta,
  VaultRecoveryMeta,
}

/** 默认库加密参数 */
export const DEFAULT_CIPHER_PARAMS: VaultCipherParams = {
  name: 'sqlcipher',
  legacy: 4,
  memorySecurity: true,
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
export function readVaultMeta(): AnyVaultMeta | null {
  return readVaultMetaFrom(vaultFilePath())
}

/** 从指定路径读取元数据（兼容 v1 旧格式） */
export function readVaultMetaFrom(file: string): AnyVaultMeta | null {
  if (!fs.existsSync(file)) return null
  try {
    const meta = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as AnyVaultMeta
    if (!meta) return null

    if (meta.version === 2) {
      if (meta.enabled !== true && meta.enabled !== 'migrating') return null
      if (typeof meta.verifier !== 'string' || !meta.verifier) return null
      return meta
    }

    if (meta.version === 1) {
      if (typeof meta.enabled !== 'boolean' && meta.enabled !== 'migrating') return null
      if (!meta.kdf || typeof meta.verifier !== 'string') return null
      return meta
    }

    return null
  } catch {
    return null
  }
}

/** 是否为旧版主密码元数据 */
export function isLegacyVaultMeta(meta: AnyVaultMeta | null | undefined): meta is LegacyVaultMeta {
  return !!meta && meta.version === 1
}

/**
 * 原子写入元数据：先写 `.tmp` 再 `rename`。
 *
 * 断电/崩溃时不会留下半截 JSON —— 否则系统会误判「未加密」而用明文方式
 * 去开一个密文库，SQLite 会报「file is not a database」，更糟的是
 * `synchronize` 可能尝试重建表，导致数据丢失。
 */
export function writeVaultMeta(meta: AnyVaultMeta, file: string = vaultFilePath()): void {
  writeVaultMetaAtomic(file, meta)
}

/** 原子写实现 */
export function writeVaultMetaAtomic(file: string, meta: AnyVaultMeta): void {
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
  fs.renameSync(tmp, file)
}

// ==================== 便捷判定 ====================

/** 加密是否已启用（含迁移中间态） */
export function isVaultEnabled(meta: AnyVaultMeta | null = readVaultMeta()): boolean {
  return !!meta && meta.enabled !== false
}

/** 是否处于迁移中间态（崩溃恢复用） */
export function isVaultMigrating(meta: AnyVaultMeta | null = readVaultMeta()): boolean {
  return meta?.enabled === 'migrating'
}

/** 校验块比对（vault.key 派生出的 MK 是否与元数据匹配） */
export { checkVerifier }
