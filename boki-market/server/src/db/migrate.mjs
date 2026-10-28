/**
 * 迁移框架：migrations/*.sql 按文件名顺序执行，已执行的记入 schema_migrations。
 * 规则：
 *   - 迁移文件只追加，不改已应用的文件（改内容不会重跑，必然不一致）
 *   - 每个文件在事务内执行，失败整体回滚
 *   - 启动时自动执行（见 main.mjs），也可 npm run migrate 手工执行
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

export const DEFAULT_MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../migrations',
)

export function listMigrations(dir = DEFAULT_MIGRATIONS_DIR) {
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
}

export function currentSchemaVersion(db) {
  const row = db.prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1').get()
  return row?.version ?? null
}

export function runMigrations(db, { dir = DEFAULT_MIGRATIONS_DIR, logger } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version),
  )
  const files = listMigrations(dir)
  const pending = files.filter((name) => !applied.has(name))

  for (const version of pending) {
    const sql = fs.readFileSync(path.join(dir, version), 'utf8')
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(sql)
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        version,
        new Date().toISOString(),
      )
      db.exec('COMMIT')
      logger?.info('db.migrated', { version })
    } catch (error) {
      db.exec('ROLLBACK')
      throw new Error(`迁移失败 ${version}: ${error.message}`, { cause: error })
    }
  }

  return {
    applied: pending,
    current: currentSchemaVersion(db),
    total: files.length,
  }
}

function setMeta(db, key, value, now) {
  db.prepare(`
    INSERT INTO market_meta (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, now)
}

function getMeta(db, key) {
  return db.prepare('SELECT value FROM market_meta WHERE key = ?').get(key)?.value ?? null
}

/**
 * 初始化 / 校正市场元信息：
 *   - market_id：首次启动生成，之后不变（客户端与运维识别同一市场实例）
 *   - schema_version：始终对齐最后一条已应用迁移
 */
export function ensureMarketMeta(db, { marketId } = {}) {
  const now = new Date().toISOString()
  const existingMarketId = getMeta(db, 'market_id')
  if (!existingMarketId) setMeta(db, 'market_id', marketId || crypto.randomUUID(), now)

  const schemaVersion = currentSchemaVersion(db)
  if (schemaVersion && getMeta(db, 'schema_version') !== schemaVersion) {
    setMeta(db, 'schema_version', schemaVersion, now)
  }

  // 002_domain.sql 会写入；这里兜底旧库/手工删键，保证 snapshotStale 可比较
  if (!getMeta(db, 'data_version')) setMeta(db, 'data_version', '1', now)

  return {
    marketId: getMeta(db, 'market_id'),
    schemaVersion: getMeta(db, 'schema_version'),
  }
}
