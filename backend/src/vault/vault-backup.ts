/**
 * 备份 / 恢复 / 明文导出（内核层，方案 §6.9）。
 *
 * 加密库带来的三个变化：
 *
 * 1. **备份产物天然是密文**（G6）：密文库不能用 `db.backup()`（实测报
 *    「backup is not supported with incompatible source and target databases」），
 *    统一走 `VACUUM INTO`；产物与源库同密钥可读。
 * 2. **恢复前必须校验一致性**：把别的密钥 / 明文的备份恢复到密文库上，
 *    结果就是永久打不开。因此恢复前先「用当前密钥试着开一下」。
 * 3. **明文导出需要用户二次确认**：密文备份拿出去没有密钥就是废文件，
 *    明文导出会生成无密钥即可打开的文件（前端必须弹确认框提示妥善保管）。
 *
 * 本模块**不依赖 Nest**：备份/恢复在 Nest 之外也可能被脚本调用。
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { readVaultMeta } from '../sdk/vault'
import { getBootKeyHex } from './keystore'
import { copyDatabaseSnapshot, openDatabase } from './db-open'

/** 恢复 / 导出结果的统一结构 */
export interface VaultBackupCheck {
  ok: boolean
  message: string
}

/**
 * 当前库是否处于「已加密」状态。
 *
 * 优先看内存中的密钥（已解锁），其次看 `vault.json`。
 */
export function isVaultEncrypted(): boolean {
  if (getBootKeyHex()) return true
  const meta = readVaultMeta()
  return !!meta && meta.enabled !== false
}

/**
 * 生成一致性快照。
 *
 * - 密文库 → `VACUUM INTO`（产物是密文，同密钥可读）
 * - 明文库 → 直接复制文件（更快）；失败退回 `VACUUM INTO`
 */
export async function createBackupSnapshot(source: string, target: string): Promise<void> {
  await copyDatabaseSnapshot(source, target, { keyHex: getBootKeyHex() })
}

/**
 * 校验备份文件与当前库的加密状态是否兼容。
 *
 * 场景矩阵：
 *
 * | 当前库 | 备份 | 结果 |
 * |:--|:--|:--|
 * | 明文 | 明文 | ✅ 可恢复 |
 * | 明文 | 密文 | ❌ 拒绝（恢复后打不开） |
 * | 密文 | 密文（同密钥） | ✅ 可恢复 |
 * | 密文 | 密文（不同密钥） | ❌ 拒绝 |
 * | 密文 | 明文 | ❌ 拒绝 |
 */
export function checkBackupCompatibility(backupFile: string): VaultBackupCheck {
  if (!fs.existsSync(backupFile)) {
    return { ok: false, message: '备份文件不存在' }
  }

  const keyHex = getBootKeyHex()
  const encrypted = isVaultEncrypted()

  if (!encrypted) {
    // 当前是明文库：备份必须也能当明文打开
    try {
      const db = openDatabase(backupFile, { readonly: true })
      try {
        db.prepare('SELECT count(*) AS c FROM sqlite_master').get()
      } finally {
        db.close()
      }
      return { ok: true, message: '备份可恢复' }
    } catch {
      return {
        ok: false,
        message: '该备份已加密，而当前数据库未启用加密（仅 DB_CIPHER=plain 回归模式），恢复后将无法打开。',
      }
    }
  }

  // 当前是密文库：备份必须能用当前密钥打开
  if (!keyHex) {
    return { ok: false, message: '未加载数据库密钥，无法校验备份' }
  }
  try {
    const db = openDatabase(backupFile, { readonly: true, keyHex })
    try {
      db.prepare('SELECT count(*) AS c FROM sqlite_master').get()
    } finally {
      db.close()
    }
    return { ok: true, message: '备份与当前密钥一致，可恢复' }
  } catch {
    return {
      ok: false,
      message: '该备份与当前数据库的加密密钥不一致，恢复后将永久无法打开。已拒绝恢复。',
    }
  }
}

/**
 * 把（密文）备份导出为**明文** SQLite 文件。
 *
 * 实现要点（实测于 better-sqlite3-multiple-ciphers 12.11.1）：
 * - 该版本**没有** `sqlcipher_export()` 函数（实测报 "no such function"），
 *   因此走「两段式」：
 *   1. 用**明文连接**建目标库，并执行源库的 `sqlite_master.sql` 建表/索引/视图/触发器
 *      —— 用原始 SQL 不做任何改写，视图里的表名引用才会落在目标库里；
 *   2. 用**密文连接**把目标库以 `ATTACH ... KEY ''` 挂进来（SQLCipher 约定：
 *      空密钥挂载 = 明文库），再 `INSERT INTO plain.x SELECT * FROM main.x` 搬数据。
 * - `VACUUM INTO` 要求目标文件**不存在**，调用前必须先删除。
 */
export async function exportPlainDatabase(source: string, target: string): Promise<void> {
  const keyHex = getBootKeyHex()
  if (!keyHex) {
    throw new Error('未加载数据库密钥，无法导出')
  }

  fs.mkdirSync(path.dirname(target), { recursive: true })
  for (const p of [target, `${target}-wal`, `${target}-shm`]) {
    if (fs.existsSync(p)) fs.rmSync(p, { force: true })
  }

  // ---------- 1. 读源库的 schema ----------
  const src = openDatabase(source, { readonly: true, keyHex })
  let objects: Array<{ type: string; name: string; sql: string }>
  try {
    objects = src
      .prepare(
        `SELECT type, name, sql FROM sqlite_master
         WHERE sql IS NOT NULL
         ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END`,
      )
      .all() as Array<{ type: string; name: string; sql: string }>
  } finally {
    src.close()
  }

  // 内部表（sqlite_sequence 等）由 SQLite 自己维护，不能手工建
  const tables = objects.filter(
    (o) => o.type === 'table' && !o.name.startsWith('sqlite_') && !/^\s*CREATE\s+VIRTUAL\s+TABLE/i.test(o.sql),
  )
  const others = objects.filter((o) => o.type !== 'table')

  // ---------- 2. 在目标明文库上按原始 SQL 建 schema ----------
  //（实测于 better-sqlite3-multiple-ciphers 12.11.1：
  //  a) 在只读连接上 ATTACH 明文库再 INSERT → "attempt to write a readonly database"；
  //  b) 在明文连接上以 x'hex' KEY 挂载密文库 → "file is not a database"（attach 时
  //     目标库需要独立的一串 cipher_* 配置，连接级配置不覆盖 attach 库）。
  //  故采用两步：明文库（普通驱动直开，journal DELETE）建 schema；
  //  再用「可写密文连接（openDatabase 应用完整 cipher 配置）+ 空密钥挂载明文库」搬数。
  //  对源库不产生数据变化，仅打开权级为可写。）
  const Database = require('better-sqlite3')
  const dest = new Database(target)
  try {
    dest.pragma('journal_mode = DELETE')
    for (const obj of [...tables, ...others]) {
      try {
        dest.exec(obj.sql)
      } catch {
        // 单个对象建不出来不应中断整份导出（例如虚拟表的影子表）
      }
    }
  } finally {
    dest.close()
  }

  // ---------- 3. 密文连接挂载目标库并搬数据 ----------
  const mover = openDatabase(source, { keyHex })
  try {
    mover.pragma('journal_mode = DELETE')
    mover.exec(`ATTACH DATABASE '${target.replace(/'/g, "''")}' AS plain KEY ''`)
    try {
      for (const obj of tables) {
        mover.exec(`INSERT INTO plain."${obj.name}" SELECT * FROM main."${obj.name}"`)
      }
    } finally {
      try { mover.exec('DETACH DATABASE plain') } catch { /* noop */ }
    }
  } finally {
    mover.close()
  }
}

/**
 * 备份文件是否已经是明文（用于 `?format=plain` 时判断是否需要转换）。
 */
export function isPlaintextDatabase(file: string): boolean {
  try {
    const fd = fs.openSync(file, 'r')
    try {
      const head = Buffer.alloc(16)
      const read = fs.readSync(fd, head, 0, 16, 0)
      return read === 16 && head.toString('latin1').startsWith('SQLite format 3')
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return false
  }
}
