/**
 * 旧版主密码库 → 密钥文件库的一次性转换。
 *
 * 旧版 vault.json（version 1）用 scrypt 把主密码/恢复码派生成 KEK，
 * 再由 KEK 解开元数据里的 MK 包装。升级时：
 *
 * 1. 用户输入一次原主密码（或恢复码）；
 * 2. 解出同一个 MK；
 * 3. 把 MK 写进 `vault.key`，并把 vault.json 改写成 v2；
 * 4. 库文件**不重加密**（MK 不变，dbKey 也不变）。
 *
 * 转换完成后主密码/恢复码立即失效，系统中不再保留任何口令派生入口。
 */
import {
  createDecipheriv,
  scryptSync,
} from 'node:crypto'
import * as fs from 'node:fs'
import {
  checkVerifier,
  DEFAULT_CIPHER_PARAMS,
  writeVaultMetaAtomic,
  type AnyVaultMeta,
  type LegacyVaultMeta,
  type VaultCipherParams,
  type VaultKdfParams,
  type VaultKeyWrap,
  type VaultMeta,
} from '../sdk/vault'
import { deriveSubKey, INFO_DB } from '../sdk/vault-kdf'
import { canOpenDatabase } from './db-open'
import { writeVaultKeyFile } from './key-file'
import { enableVaultEncryption, type ProgressFn } from './vault-migrate'
import { isPlaintextDatabase } from './vault-backup'

const INFO_KEK_PASSWORD = 'boki/kek/password/v1'
const INFO_KEK_RECOVERY = 'boki/kek/recovery/v1'

function scryptMaxmem(kdf: VaultKdfParams): number {
  return 128 * kdf.N * kdf.r * 2
}

/** 主密码 / 恢复码统一做 NFKC 规范化，避免不同输入法产生不同密钥 */
function normalizeSecret(secret: string): string {
  return secret.normalize('NFKC')
}

/** 恢复码归一化：去分隔符、去空白、转大写 */
function normalizeRecoveryCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase()
}

function deriveLegacyBase(secret: string, kdf: VaultKdfParams): Buffer {
  return scryptSync(normalizeSecret(secret), Buffer.from(kdf.salt, 'hex'), kdf.keylen, {
    N: kdf.N,
    r: kdf.r,
    p: kdf.p,
    maxmem: scryptMaxmem(kdf),
  })
}

/** 解包旧版 AES-256-GCM 的 MK 包装 */
function unwrapKey(wrap: VaultKeyWrap | undefined | null, kek: Buffer): Buffer | null {
  if (!wrap || wrap.algo !== 'aes-256-gcm') return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', kek, Buffer.from(wrap.iv, 'hex'))
    decipher.setAuthTag(Buffer.from(wrap.tag, 'hex'))
    const out = Buffer.concat([
      decipher.update(Buffer.from(wrap.ciphertext, 'hex')),
      decipher.final(),
    ])
    return out.length === 32 ? out : null
  } catch {
    return null
  }
}

/** 由旧版主密码解出 MK（兼容无 keyWrap 的更旧格式） */
export function deriveLegacyMasterKey(password: string, meta: LegacyVaultMeta): Buffer {
  if (meta.keyWrap) {
    const kek = deriveSubKey(deriveLegacyBase(password, meta.kdf), INFO_KEK_PASSWORD)
    const mk = unwrapKey(meta.keyWrap, kek)
    if (!mk) throw new Error('主密码错误')
    return mk
  }
  return deriveLegacyBase(password, meta.kdf)
}

/** 由旧版恢复码解出 MK */
export function deriveLegacyRecoveryMasterKey(code: string, meta: LegacyVaultMeta): Buffer {
  const recovery = meta.recovery
  if (!recovery?.enabled || !recovery.wrap || !recovery.kdf) {
    throw new Error('该库未启用恢复码')
  }
  const kek = deriveSubKey(deriveLegacyBase(normalizeRecoveryCode(code), recovery.kdf), INFO_KEK_RECOVERY)
  const mk = unwrapKey(recovery.wrap, kek)
  if (!mk) throw new Error('恢复码错误')
  return mk
}

export interface LegacyConvertOptions {
  meta: LegacyVaultMeta
  dbPath: string
  vaultFile: string
  keyFile: string
  password?: string
  recoveryCode?: string
  onProgress?: ProgressFn
}

/**
 * 执行旧库转换。
 *
 * @returns 主密钥与新的 v2 元数据（同时已落盘）
 */
export async function convertLegacyVaultToKeyFile(
  options: LegacyConvertOptions,
): Promise<{ mk: Buffer; meta: VaultMeta }> {
  const { meta, dbPath, vaultFile, keyFile } = options

  let mk: Buffer
  if (options.recoveryCode) {
    mk = deriveLegacyRecoveryMasterKey(options.recoveryCode, meta)
  } else {
    if (!options.password) throw new Error('请输入原主密码')
    mk = deriveLegacyMasterKey(options.password, meta)
  }
  if (!checkVerifier(mk, meta.verifier)) {
    throw new Error('主密码或恢复码错误')
  }

  const cipher: VaultCipherParams = meta.cipher ?? DEFAULT_CIPHER_PARAMS
  const nextMeta: VaultMeta = {
    version: 2,
    enabled: true,
    cipher,
    verifier: meta.verifier,
    createdAt: meta.createdAt || new Date().toISOString(),
    ...(meta.attachments ? { attachments: meta.attachments } : {}),
  }

  // 情况 A：库已经是「这把钥匙能开的密文」→ 只换钥匙载体，不重加密
  if (canOpenDatabase(dbPath, deriveSubKey(mk, INFO_DB).toString('hex'), cipher.legacy)) {
    options.onProgress?.('写入密钥文件', 60)
    writeVaultKeyFile(mk, keyFile)
    options.onProgress?.('更新加密状态', 90)
    writeVaultMetaAtomic(vaultFile, nextMeta)
    options.onProgress?.('完成', 100)
    return { mk, meta: nextMeta }
  }

  // 情况 B：库还是明文（旧版未启用加密，或迁移中断回滚）→ 用同一把 MK 重新加密
  if (!isPlaintextDatabase(dbPath)) {
    throw new Error('数据库无法用旧密码派生的密钥打开，已拒绝转换（请确认 vault.json 与数据库来自同一套账）')
  }
  options.onProgress?.('清理旧加密标记', 10)
  fs.rmSync(vaultFile, { force: true })
  const result = await enableVaultEncryption({
    dbPath,
    vaultFile,
    keyFile,
    mk,
    cipher,
    onProgress: options.onProgress,
    keepPlainBackup: false,
  })
  return { mk, meta: result.meta }
}

/** 类型收窄辅助（供调用方在转换前后使用） */
export function isLegacyMeta(meta: AnyVaultMeta | null): meta is LegacyVaultMeta {
  return !!meta && meta.version === 1
}
