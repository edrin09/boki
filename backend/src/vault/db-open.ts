/**
 * 直接打开 SQLite 文件（带 / 不带加密）。
 *
 * TypeORM 的连接由 `config/database.config.ts` 负责；
 * 但备份、恢复、迁移、附件批处理这些场景需要在 Nest 之外单独打开库文件，
 * 统一走这里，保证 cipher 参数与内核完全一致。
 *
 * ⚠️ PRAGMA 顺序不可颠倒：`cipher` → `legacy` → `key` → 之后才能 WAL / foreign_keys。
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

/** better-sqlite3-multiple-ciphers（以 npm alias 形式装在 better-sqlite3 下） */
type SqliteDatabase = any

export interface OpenDatabaseOptions {
  /** 只读打开 */
  readonly?: boolean
  /** 库密钥（hex）。null / undefined 表示明文库 */
  keyHex?: string | null
  /** SQLCipher 兼容版本 */
  legacy?: number
  /** 文件不存在时是否报错 */
  fileMustExist?: boolean
}

/**
 * 打开数据库文件。
 *
 * @param file 数据库文件路径
 */
export function openDatabase(file: string, options: OpenDatabaseOptions = {}): SqliteDatabase {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require('better-sqlite3')
  const db = new Database(file, {
    readonly: !!options.readonly,
    fileMustExist: !!options.fileMustExist,
    timeout: 5000,
  })
  try {
    if (options.keyHex) {
      db.pragma("cipher = 'sqlcipher'")
      db.pragma(`legacy = ${options.legacy ?? 4}`)
      db.pragma(`key = "x'${options.keyHex}'"`)
      db.pragma('cipher_memory_security = ON')
    }
  } catch (err) {
    try { db.close() } catch { /* noop */ }
    throw err
  }
  return db
}

/**
 * 用指定密钥尝试打开数据库并读一次 sqlite_master。
 *
 * 用于在 Nest 之外判断「这把钥匙能不能开这个库」，不会改动数据。
 */
export function canOpenDatabase(file: string, keyHex: string, legacy = 4): boolean {
  if (!fs.existsSync(file)) return false
  let db: SqliteDatabase | null = null
  try {
    db = openDatabase(file, { readonly: true, keyHex, legacy, fileMustExist: true })
    db.prepare('SELECT count(*) AS c FROM sqlite_master').get()
    return true
  } catch {
    return false
  } finally {
    try { db?.close() } catch { /* noop */ }
  }
}

/**
 * 创建一个可被 rekey 的空 SQLite 文件。
 *
 * 0 字节文件没有有效的库头，直接 `PRAGMA rekey` 会失败；
 * 先建一张临时表再删除，让文件拥有合法的 sqlite_master 页。
 */
export function createEmptyDatabase(file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = openDatabase(file)
  try {
    db.pragma('journal_mode = DELETE')
    db.exec('CREATE TABLE IF NOT EXISTS __vault_init (x INTEGER)')
    db.exec('DROP TABLE IF EXISTS __vault_init')
  } finally {
    db.close()
  }
}

/**
 * 用「一致性快照」的方式复制数据库文件。
 *
 * ⚠️ `db.backup()` 在密文库上会抛
 * 「backup is not supported with incompatible source and target databases」
 * （实测于 better-sqlite3-multiple-ciphers 12.11.1），
 * 因此密文库统一走 `VACUUM INTO`：产物是密文、且与源库同密钥可读。
 *
 * 明文库优先直接复制文件（更快），失败再退回 VACUUM INTO。
 */
export async function copyDatabaseSnapshot(
  source: string,
  target: string,
  options: OpenDatabaseOptions = {},
): Promise<void> {
  fs.mkdirSync(path.dirname(target), { recursive: true })

  // 明文库：直接复制最快（备份目录与库目录通常在同一磁盘）
  if (!options.keyHex) {
    try {
      await fs.promises.copyFile(source, target)
      return
    } catch (err: any) {
      // EBUSY / EPERM：文件被占用，退回 VACUUM INTO
      if (err?.code !== 'EBUSY' && err?.code !== 'EPERM') throw err
    }
  }

  const db = openDatabase(source, { ...options, readonly: true })
  try {
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
  } finally {
    db.close()
  }
}
