/**
 * 明文库 → 密文库 的迁移（§9）。
 *
 * 关键约束：
 * 1. **迁移前必须写 `enabled: 'migrating'`**，否则中途崩溃后系统会误判
 *    「未加密」，用明文方式去开密文库 —— SQLite 会报「file is not a database」，
 *    而 `synchronize` 可能尝试重建表，数据就没了。
 * 2. **必须先清 WAL**：WAL 里的页面还没落盘，rekey 只会改主库文件。
 * 3. **必须留一份 `.pre-encrypt.bak`**：rekey 中断即库损坏，备份是唯一退路。
 * 4. **必须用新密钥重开校验**，确认行数一致后才把状态改成 `true`。
 */
import { randomBytes } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  DEFAULT_CIPHER_PARAMS,
  readVaultMetaFrom,
  writeVaultMetaAtomic,
  type VaultKdfParams,
  type VaultMeta,
  type VaultProvider,
} from '../sdk/vault'
import {
  DEFAULT_KDF,
  INFO_KEK_PASSWORD,
  INFO_KEK_RECOVERY,
  deriveKek,
  deriveSubKey,
  INFO_DB,
  makeVerifier,
  unwrapKey,
  wrapKey,
} from '../sdk/vault-kdf'
import { openDatabase } from './db-open'

/** 迁移进度回调 */
export type ProgressFn = (step: string, percent: number) => void

export interface EnableEncryptionOptions {
  /** 数据库文件路径 */
  dbPath: string
  /** vault.json 路径 */
  vaultFile: string
  /** 主密码 */
  masterPassword: string
  /** 恢复码（可选，但生产环境强烈建议提供） */
  recoveryCode?: string
  /** provider（写入元数据用） */
  provider: VaultProvider
  /** KDF 参数（默认 scrypt N=32768） */
  kdf?: Omit<VaultKdfParams, 'salt'>
  /** 进度回调 */
  onProgress?: ProgressFn
  /** 迁移完成后是否保留明文备份（默认 false，需用户确认后删除） */
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

/**
 * 执行迁移：明文库 → 密文库。
 *
 * ⚠️ 调用方必须**先关闭 DataSource**（停止所有写入）再调用本函数。
 */
export async function enableVaultEncryption(
  options: EnableEncryptionOptions,
): Promise<EnableEncryptionResult> {
  const { dbPath, vaultFile, masterPassword, provider, onProgress } = options
  const progress: ProgressFn = onProgress ?? (() => undefined)
  const kdfBase = options.kdf ?? DEFAULT_KDF

  if (!fs.existsSync(dbPath)) {
    throw new Error('数据库文件不存在，无法开启加密')
  }
  if (readVaultMetaFrom(vaultFile)) {
    throw new Error('当前库已启用加密')
  }

  // ---------- 1. 生成密钥材料 ----------
  progress('生成密钥材料', 5)
  const mk = randomBytes(32)
  const kdf: VaultKdfParams = { ...kdfBase, salt: randomBytes(32).toString('hex') }
  const kek = deriveKek(masterPassword, kdf, INFO_KEK_PASSWORD)
  const keyWrap = wrapKey(mk, kek)
  const verifier = makeVerifier(mk)
  const dbKeyHex = deriveSubKey(mk, INFO_DB).toString('hex')

  const recovery = options.recoveryCode
    ? (() => {
        const rcKdf: VaultKdfParams = { ...kdfBase, salt: randomBytes(32).toString('hex') }
        const rcKek = deriveKek(options.recoveryCode!, rcKdf, INFO_KEK_RECOVERY)
        return {
          enabled: true,
          createdAt: new Date().toISOString(),
          kdf: rcKdf,
          wrap: wrapKey(mk, rcKek),
        }
      })()
    : { enabled: false }

  const now = new Date().toISOString()
  const meta: VaultMeta = {
    version: 1,
    enabled: 'migrating',
    provider: provider.id,
    cipher: { ...DEFAULT_CIPHER_PARAMS },
    kdf,
    verifier,
    createdAt: now,
    rotation: { at: now, count: 0 },
    recovery,
    keyWrap,
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
    for (const suffix of ['-wal', '-shm']) {
      const leftover = `${dbPath}${suffix}`
      if (fs.existsSync(leftover)) fs.rmSync(leftover, { force: true })
    }
    fs.copyFileSync(dbPath, backupPath)

    // ---------- 5. 原地 rekey ----------
    progress('加密数据库文件', 45)
    const enc = openDatabase(dbPath)
    try {
      enc.pragma("cipher = 'sqlcipher'")
      enc.pragma(`legacy = ${meta.cipher.legacy}`)
      enc.pragma(`rekey = "x'${dbKeyHex}'"`)
    } finally {
      enc.close()
    }

    // ---------- 6. 用新密钥重开校验 ----------
    progress('校验数据完整性', 70)
    const verify = openDatabase(dbPath, { keyHex: dbKeyHex, legacy: meta.cipher.legacy })
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

    // ---------- 7. 落「已加密」状态 ----------
    progress('写入加密完成标记', 85)
    const done: VaultMeta = { ...meta, enabled: true }
    writeVaultMetaAtomic(vaultFile, done)

    // ---------- 8. 清理 WAL 残留 ----------
    progress('清理临时文件', 92)
    for (const suffix of ['-wal', '-shm']) {
      const leftover = `${dbPath}${suffix}`
      if (fs.existsSync(leftover)) {
        try { fs.rmSync(leftover, { force: true }) } catch { /* 文件被占用，忽略 */ }
      }
    }

    // ---------- 9. 明文备份：默认删除（需用户确认） ----------
    if (!options.keepPlainBackup && fs.existsSync(backupPath)) {
      fs.rmSync(backupPath, { force: true })
    }

    progress('完成', 100)
    return { meta: done, backupPath, vouchersBefore, vouchersAfter }
  } catch (err) {
    // 迁移失败：状态保持 'migrating'，等待 vault:recover 处理
    throw err
  }
}

/**
 * 崩溃恢复：处理 `enabled === 'migrating'` 的状态。
 *
 * @param masterPassword 主密码（可选）。提供且库已是密文时，可自动补齐状态标记。
 * @returns 'already-encrypted' | 'rolled-back' | 'needs-manual'
 */
export async function recoverVaultMigration(
  vaultFile: string,
  dbPath: string,
  masterPassword?: string,
): Promise<{ result: 'already-encrypted' | 'rolled-back' | 'needs-manual'; message: string }> {
  const meta = readVaultMetaFrom(vaultFile)
  if (!meta) return { result: 'needs-manual', message: '未找到 vault.json，无法判断迁移状态' }
  if (meta.enabled !== 'migrating') {
    return { result: 'already-encrypted', message: `当前状态为 ${meta.enabled}，无需恢复` }
  }

  const backupPath = `${dbPath}.pre-encrypt.bak`

  // 情况 A：库已经是密文（rekey 成功但没写完状态）→ 用主密码派生密钥验证后补状态
  if (masterPassword && meta.keyWrap) {
    const kek = deriveKek(masterPassword, meta.kdf, INFO_KEK_PASSWORD)
    const mk = unwrapKey(meta.keyWrap, kek)
    if (mk) {
      try {
        const probe = openDatabase(dbPath, { keyHex: deriveSubKey(mk, INFO_DB).toString('hex') })
        probe.close()
        const done: VaultMeta = { ...meta, enabled: true }
        writeVaultMetaAtomic(vaultFile, done)
        return { result: 'already-encrypted', message: '数据库已加密，补齐状态标记完成' }
      } catch {
        // 密钥对不上，说明库其实还是明文 → 走情况 B
      }
    }
  }

  // 情况 B：库还是明文 → 用明文备份覆盖回去，清掉 vault.json
  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, dbPath)
    for (const suffix of ['-wal', '-shm']) {
      const leftover = `${dbPath}${suffix}`
      if (fs.existsSync(leftover)) {
        try { fs.rmSync(leftover, { force: true }) } catch { /* noop */ }
      }
    }
    fs.rmSync(vaultFile, { force: true })
    fs.rmSync(backupPath, { force: true })
    return { result: 'rolled-back', message: '已回滚到迁移前的明文库，并清除了加密状态' }
  }

  return {
    result: 'needs-manual',
    message: `迁移处于中间状态且无法自动恢复。
请检查 ${path.basename(backupPath)} 是否存在：
  - 存在 → 用它覆盖 ${path.basename(dbPath)} 后删除 vault.json，重新执行迁移
  - 不存在 → 数据库可能已损坏，请从备份恢复`,
  }
}
