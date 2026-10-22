import * as fs from 'node:fs'
import * as path from 'node:path'
import { TypeOrmModuleOptions } from '@nestjs/typeorm'
import { entities as coreEntities } from '../entities'
import { syncRequiredMarker } from '../plugins/plugin.paths'
import { getBootKeyHex } from '../vault/keystore'

/**
 * 解析数据库文件路径（相对 backend 目录）
 */
export function resolveDatabasePath(): string {
  const raw = process.env.DB_DATABASE || './data/financial.db'
  const resolved = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw)
  const dir = path.dirname(resolved)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return resolved
}

/**
 * 是否需要执行 schema 同步。
 *
 * - 全新数据库：必须建表
 * - 安装插件后：`.sync-required` 标记存在，建表后由 main.ts 清理
 * - 其他情况：默认关闭，避免每次启动都扫描/改表
 * - `DB_SYNCHRONIZE=true|false` 可显式覆盖
 */
export function shouldSynchronize(database: string): boolean {
  const flag = (process.env.DB_SYNCHRONIZE || '').toLowerCase()
  if (flag === 'true') return true
  if (flag === 'false') return false
  if (!fs.existsSync(database)) return true
  try {
    if (fs.statSync(database).size === 0) return true
  } catch {
    // ignore
  }
  return fs.existsSync(syncRequiredMarker())
}

/**
 * TypeORM 数据库配置（SQLite / better-sqlite3）
 *
 * 驱动：`better-sqlite3` 这个包名下装的是 `better-sqlite3-multiple-ciphers`
 * （npm alias，见 package.json）。不设 cipher 时行为与原生 better-sqlite3 完全一致，
 * 因此未启用加密的部署零感知。
 *
 * @param pluginEntities 已安装插件实体（含停用插件，保留其表结构）
 */
export function buildDatabaseOptions(pluginEntities: any[] = []): TypeOrmModuleOptions {
  const database = resolveDatabasePath()
  const entities = [...coreEntities, ...pluginEntities.filter(Boolean)]

  return {
    type: 'better-sqlite3',
    database,
    entities,
    synchronize: shouldSynchronize(database),
    logging: process.env.DB_LOGGING === 'true',
    // WAL 模式提升读写并发能力
    prepareDatabase: (db: any) => {
      applyCipher(db)
      db.pragma('journal_mode = WAL')
      db.pragma('foreign_keys = ON')
      db.pragma('busy_timeout = 5000')
    },
  } as TypeOrmModuleOptions
}

/**
 * 应用 SQLCipher 加密参数。
 *
 * ⚠️ PRAGMA 顺序不可颠倒：`cipher` → `legacy` → `key` → 之后才能 WAL / foreign_keys。
 * 顺序错了 SQLite 会把密文库当成损坏文件。
 *
 * `DB_CIPHER=plain` 可强制走明文（**仅供回归对比**，生产禁用）。
 */
function applyCipher(db: any): void {
  if ((process.env.DB_CIPHER || '').toLowerCase() === 'plain') {
    return
  }
  const key = getBootKeyHex()
  if (!key) {
    // 未加密库：显式声明 plain，避免误用上一次连接的 cipher 设置
    return
  }
  db.pragma("cipher = 'sqlcipher'")
  db.pragma('legacy = 4')
  db.pragma(`key = "x'${key}'"`)
  db.pragma('cipher_memory_security = ON')
}
