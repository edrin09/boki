/**
 * 明文库 → 密文库 的迁移。
 *
 * 关键约束：
 * 1. **迁移前必须写 `enabled: 'migrating'`**，否则中途崩溃后系统会误判
 *    「未加密」，用明文方式去开密文库 —— SQLite 会报「file is not a database」，
 *    而 `synchronize` 可能尝试重建表，数据就没了。
 * 2. **必须先清 WAL**：WAL 里的页面还没落盘，rekey 只会改主库文件。
 * 3. **必须留一份 `.pre-encrypt.bak`**：rekey 中断即库损坏，备份是唯一退路。
 * 4. **必须用新密钥重开校验**，确认行数一致后才把状态改成 `true`。
 * 5. **vault.key 必须在最终状态之前落盘**：否则状态已「加密」而钥匙丢了，
 *    库就永远打不开了。
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  DEFAULT_CIPHER_PARAMS,
  isLegacyVaultMeta,
  readVaultMetaFrom,
  writeVaultMetaAtomic,
  type VaultCipherParams,
  type VaultMeta,
} from '../sdk/vault'
import { deriveSubKey, INFO_DB, makeVerifier } from '../sdk/vault-kdf'
import { canOpenDatabase, openDatabase } from './db-open'
import { writeVaultKeyFile } from './key-file'

/** 迁移进度回调 */
export type ProgressFn = (step: string, percent: number) => void

export interface EnableEncryptionOptions {
  /** 数据库文件路径 */
  dbPath: string
  /** vault.json 路径 */
  vaultFile: string
  /** vault.key 路径 */
  keyFile: string
  /** 主密钥（32 字节，来自 vault.key 或旧库转换） */
  mk: Buffer
  /** 库加密参数 */
  cipher?: VaultCipherParams
  /** 进度回调 */
  onProgress?: ProgressFn
  /** 迁移完成后是否保留明文备份（默认 false） */
  keepPlainBackup?: boolean
}

export interface EnableEncryptionResult {
  meta: VaultMeta
  /** 迁移过程中的明文备份路径 */
  backupPath: string
  /** 迁移前凭证条数 */
  vouchersBefore: number
  /** 迁移后凭证条数 */
  vouchersAfter: number
}

/** 统计关键表行数（用于迁移校验） */
function countRows(db: any, table: string): number {
  try {
    const row = db.prepare(`SELECT count(*) AS c FROM ${table}`).get()
    return Number(row?.c ?? 0)
  } catch {
    return -1
  }
}

/** 清理 WAL / SHM 残留 */
function removeWalFiles(dbPath: string): void {
  for (const suffix of ['-wal', '-shm']) {
    const leftover = `${dbPath}${suffix}`
    if (fs.existsSync(leftover)) {
      try { fs.rmSync(leftover, { force: true }) } catch { /* 文件被占用，忽略 */ }
    }
  }
}

/**
 * 执行迁移：明文库 → 密文库。
 *
 * ⚠️ 调用方必须**先关闭 DataSource**（停止所有写入）再调用本函数。
 */
export async function enableVaultEncryption(
  options: EnableEncryptionOptions,
): Promise<EnableEncryptionResult> {
  const { dbPath, vaultFile, keyFile, mk } = options
  const progress: ProgressFn = options.onProgress ?? (() => undefined)
  const cipher = options.cipher ?? DEFAULT_CIPHER_PARAMS

  if (!Buffer.isBuffer(mk) || mk.length !== 32) {
    throw new Error('主密钥必须是 32 字节')
  }
  if (!fs.existsSync(dbPath)) {
    throw new Error('数据库文件不存在，无法开启加密')
  }
  if (readVaultMetaFrom(vaultFile)) {
    throw new Error('当前库已启用加密')
  }

  // ---------- 1. 生成密钥材料（MK 来自密钥文件，不再生成） ----------
  progress('准备密钥材料', 5)
  const verifier = makeVerifier(mk)
  const dbKeyHex = deriveSubKey(mk, INFO_DB).toString('hex')

  const meta: VaultMeta = {
    version: 2,
    enabled: 'migrating',
    cipher: { ...cipher },
    verifier,
    createdAt: new Date().toISOString(),
  }

  // ---------- 2. 先落「迁移中」状态 ----------
  progress('写入迁移中标记', 12)
  writeVaultMetaAtomic(vaultFile, meta)

  const backupPath = `${dbPath}.pre-encrypt.bak`
  try {
    // ---------- 3. 清 WAL + 退出 WAL 模式 ----------
    progress('整理 WAL 日志', 20)
    const plain = openDatabase(dbPath)
    const vouchersBefore = countRows(plain, 'fin_voucher')
    try {
      plain.pragma('wal_checkpoint(TRUNCATE)')
      plain.pragma('journal_mode = DELETE')
    } catch {
      // 某些场景（已经是 DELETE 模式）会报错，忽略
    }
    plain.close()

    // ---------- 4. 明文备份（唯一退路） ----------
    progress('创建明文备份', 30)
    removeWalFiles(dbPath)
    fs.copyFileSync(dbPath, backupPath)

    // ---------- 5. 原地 rekey ----------
    progress('加密数据库文件', 45)
    const enc = openDatabase(dbPath)
    try {
      enc.pragma("cipher = 'sqlcipher'")
      enc.pragma(`legacy = ${cipher.legacy}`)
      enc.pragma(`rekey = "x'${dbKeyHex}'"`)
    } finally {
      enc.close()
    }

    // ---------- 6. 用新密钥重开校验 ----------
    progress('校验数据完整性', 70)
    const verify = openDatabase(dbPath, { keyHex: dbKeyHex, legacy: cipher.legacy })
    let vouchersAfter = -1
    try {
      vouchersAfter = countRows(verify, 'fin_voucher')
    } finally {
      verify.close()
    }
    if (vouchersBefore >= 0 && vouchersAfter !== vouchersBefore) {
      throw new Error(
        `迁移校验失败：凭证条数不一致（${vouchersBefore} → ${vouchersAfter}），已保留明文备份 ${path.basename(backupPath)}`,
      )
    }

    // ---------- 7. 先落密钥文件，再落「已加密」状态 ----------
    progress('写入密钥文件', 82)
    writeVaultKeyFile(mk, keyFile)

    progress('写入加密完成标记', 90)
    const done: VaultMeta = { ...meta, enabled: true }
    writeVaultMetaAtomic(vaultFile, done)

    // ---------- 8. 清理 WAL 残留 ----------
    progress('清理临时文件', 95)
    removeWalFiles(dbPath)

    // ---------- 9. 明文备份：默认删除 ----------
    if (!options.keepPlainBackup && fs.existsSync(backupPath)) {
      fs.rmSync(backupPath, { force: true })
    }

    progress('完成', 100)
    return { meta: done, backupPath, vouchersBefore, vouchersAfter }
  } catch (err) {
    // 迁移失败：状态保持 'migrating'，等待下次启动自动恢复
    throw err
  }
}

/**
 * 崩溃恢复：处理 v2 的 `enabled === 'migrating'` 状态。
 *
 * @returns 'already-encrypted' | 'rolled-back'
 */
export async function settleVaultMigration(
  vaultFile: string,
  dbPath: string,
  keyFile: string,
  mk: Buffer,
): Promise<{ result: 'already-encrypted' | 'rolled-back'; message: string }> {
  const meta = readVaultMetaFrom(vaultFile)
  if (!meta) {
    throw new Error('未找到 vault.json，无法判断迁移状态')
  }
  if (isLegacyVaultMeta(meta)) {
    throw new Error('检测到旧版加密状态，请先完成主密码转换')
  }
  if (meta.enabled !== 'migrating') {
    return { result: 'already-encrypted', message: `当前状态为 ${meta.enabled}，无需恢复` }
  }

  const dbKeyHex = deriveSubKey(mk, INFO_DB).toString('hex')
  const backupPath = `${dbPath}.pre-encrypt.bak`

  // 情况 A：库已经是密文（rekey 成功但没写完状态）→ 补齐标记
  if (canOpenDatabase(dbPath, dbKeyHex, meta.cipher.legacy)) {
    writeVaultKeyFile(mk, keyFile)
    writeVaultMetaAtomic(vaultFile, { ...meta, enabled: true })
    return { result: 'already-encrypted', message: '数据库已加密，补齐状态标记完成' }
  }

  // 情况 B：库还是明文 → 用明文备份覆盖回去，清掉加密状态
  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, dbPath)
    removeWalFiles(dbPath)
    fs.rmSync(vaultFile, { force: true })
    fs.rmSync(backupPath, { force: true })
    return { result: 'rolled-back', message: '已回滚到迁移前的明文库，并清除了加密状态' }
  }

  throw new Error(
    `迁移处于中间状态且无法自动恢复。
请检查 ${path.basename(backupPath)} 是否存在：
  - 存在 → 用它覆盖 ${path.basename(dbPath)} 后删除 vault.json，重新启动
  - 不存在 → 数据库可能已损坏，请从备份恢复`,
  )
}
