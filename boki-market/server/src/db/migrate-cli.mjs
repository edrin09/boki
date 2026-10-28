/** npm run migrate：手工执行迁移（服务启动时也会自动执行） */
import path from 'node:path'
import { loadConfig, PROJECT_ROOT } from '../lib/config.mjs'
import { loadDotEnv } from '../lib/env.mjs'
import { createLogger } from '../lib/logger.mjs'
import { openDatabase } from './connection.mjs'
import { ensureMarketMeta, runMigrations } from './migrate.mjs'

loadDotEnv(process.env.MARKET_ENV_FILE || path.join(PROJECT_ROOT, '.env'))

const config = loadConfig()
const logger = createLogger({ level: config.logLevel })
const db = openDatabase(config.dbFile)

try {
  const result = runMigrations(db, { logger })
  const meta = ensureMarketMeta(db)
  logger.info('db.ready', {
    file: config.dbFile,
    applied: result.applied,
    current: result.current,
    total: result.total,
    marketId: meta.marketId,
  })
} finally {
  db.close()
}
