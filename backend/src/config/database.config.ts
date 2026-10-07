import * as fs from 'node:fs'
import * as path from 'node:path'
import { TypeOrmModuleOptions } from '@nestjs/typeorm'
import { entities } from '../entities'

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
 * TypeORM 数据库配置（SQLite / better-sqlite3）
 */
export function buildDatabaseOptions(): TypeOrmModuleOptions {
  const database = resolveDatabasePath()

  return {
    type: 'better-sqlite3',
    database,
    entities,
    synchronize: process.env.DB_SYNCHRONIZE !== 'false',
    logging: process.env.DB_LOGGING === 'true',
    // WAL 模式提升读写并发能力
    prepareDatabase: (db: any) => {
      db.pragma('journal_mode = WAL')
      db.pragma('foreign_keys = ON')
      db.pragma('busy_timeout = 5000')
    },
  } as TypeOrmModuleOptions
}