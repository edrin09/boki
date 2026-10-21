import * as fs from 'node:fs'
import * as path from 'node:path'
import { TypeOrmModuleOptions } from '@nestjs/typeorm'
import { entities as coreEntities } from '../entities'
import { syncRequiredMarker } from '../plugins/plugin.paths'

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
      db.pragma('journal_mode = WAL')
      db.pragma('foreign_keys = ON')
      db.pragma('busy_timeout = 5000')
    },
  } as TypeOrmModuleOptions
}
