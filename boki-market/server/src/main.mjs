#!/usr/bin/env node
/**
 * boki-market 服务入口（Node 22，ESM，零第三方依赖）
 *
 * 启动流程：读 .env → 校验配置 → 打开独立市场库 → 自动迁移 → 监听 HTTP。
 * 迁移是幂等的；数据库只有 market.db 一个文件（WAL 追加 -wal/-shm）。
 */
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig, PROJECT_ROOT } from './lib/config.mjs'
import { loadDotEnv } from './lib/env.mjs'
import { createLogger } from './lib/logger.mjs'
import { createRateLimiter } from './lib/rate-limit.mjs'
import {
  HttpError,
  clientIp,
  isLoopback,
  isSecureRequest,
  sendJson,
} from './lib/http.mjs'
import { openDatabase } from './db/connection.mjs'
import { ensureMarketMeta, runMigrations } from './db/migrate.mjs'
import { handlePublic } from './routes/public.mjs'
import { handleAdmin } from './routes/admin.mjs'
import { createStatsWriter } from './services/stats.mjs'

/**
 * 创建服务实例（不监听端口，便于测试注入临时库）
 * @param {Record<string, string|undefined>} overrides 覆盖环境变量（测试用）
 */
export function createMarketServer(overrides = {}) {
  const config = loadConfig(overrides)
  const logger = createLogger({ level: config.logLevel })
  const db = openDatabase(config.dbFile)
  const startedAt = Date.now()

  let meta
  try {
    const migrations = runMigrations(db, { logger })
    meta = ensureMarketMeta(db)
    logger.info('db.ready', {
      file: config.dbFile,
      applied: migrations.applied,
      current: migrations.current,
      total: migrations.total,
      marketId: meta.marketId,
    })
  } catch (error) {
    db.close()
    throw error
  }

  const limiter = createRateLimiter({ limit: config.rateLimit, windowMs: 60_000 })
  const stats = createStatsWriter({
    db,
    logger,
    flushMs: config.statsFlushMs,
    batchSize: config.statsBatchSize,
  })
  const ctx = {
    config,
    db,
    logger,
    limiter,
    stats,
    startedAt,
    meta,
    snapshotCache: undefined,
  }

  const server = http.createServer((req, res) => {
    handleRequest(req, res, ctx).catch((error) => failRequest(req, res, ctx, error))
  })

  return {
    config,
    db,
    server,
    logger,
    ctx,
    get port() {
      const address = server.address()
      return address && typeof address === 'object' ? address.port : null
    },
    listen(port = config.port) {
      return new Promise((resolve, reject) => {
        const onError = (error) => reject(error)
        server.once('error', onError)
        server.listen(port, config.host, () => {
          server.off('error', onError)
          resolve({ port: server.address().port })
        })
      })
    },
    async close() {
      await new Promise((resolve) => server.close(() => resolve()))
      try {
        stats.close()
      } catch {
        /* 统计 flush 失败不阻塞退出 */
      }
      try {
        db.close()
      } catch {
        /* 已关闭 */
      }
    },
  }
}

function requestPath(req) {
  try {
    return new URL(req.url, 'http://market.local').pathname
  } catch {
    return 'invalid-url'
  }
}

async function handleRequest(req, res, ctx) {
  const startedAt = process.hrtime.bigint()
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6
    // 只记录 pathname：下载 URL 的查询串里可能带 license，不能进日志
    ctx.logger.info('http.request', {
      method: req.method,
      path: requestPath(req),
      status: res.statusCode,
      ms: Math.round(ms),
      ip: clientIp(req, { trustProxy: ctx.config.trustProxy }),
    })
  })

  try {
    const url = new URL(req.url, 'http://market.local')
    const pathname = url.pathname

    if (
      ctx.config.requireHttps &&
      !isSecureRequest(req, { trustProxy: ctx.config.trustProxy }) &&
      !isLoopback(req.socket?.remoteAddress)
    ) {
      sendJson(res, 403, { code: 403, message: '必须通过 HTTPS 访问市场接口' })
      return
    }

    if (pathname !== '/v1/health' && ctx.limiter.enabled) {
      // 公共与管理接口各用独立桶，避免管理操作挤占客户端下载配额（接入说明 5.2）
      const area = pathname.startsWith('/v1/admin') ? 'admin' : 'public'
      const limit = ctx.limiter.check(`${area}:${clientIp(req, { trustProxy: ctx.config.trustProxy })}`)
      if (!limit.allowed) {
        sendJson(
          res,
          429,
          { code: 429, message: '请求过于频繁，请稍后再试' },
          { 'Retry-After': String(limit.retryAfterSec) },
        )
        return
      }
    }

    const handled = pathname.startsWith('/v1/admin')
      ? await handleAdmin(req, res, ctx)
      : await handlePublic(req, res, ctx)

    if (!handled) sendJson(res, 404, { code: 404, message: 'Not Found' })
  } catch (error) {
    failRequest(req, res, ctx, error)
  }
}

function failRequest(req, res, ctx, error) {
  if (error instanceof HttpError) {
    sendJson(res, error.status, { code: error.code, message: error.message, ...error.detail }, error.headers)
    return
  }

  ctx.logger.error('http.unhandled', {
    method: req.method,
    path: requestPath(req),
    message: error?.message,
    stack: error?.stack,
  })

  if (!res.headersSent) {
    sendJson(res, 500, { code: 500, message: '服务端错误' })
  } else {
    res.destroy()
  }
}

function bootWarnings(config) {
  const warnings = []
  if (!config.licenseSecret) warnings.push('未配置 MARKET_LICENSE_SECRET：收费插件下载将无法授权')
  if (config.publicKeys.size === 0) warnings.push('未配置 MARKET_PUBLIC_KEYS：索引快照激活前的验签自检不可用')
  if (config.nodeEnv === 'production' && !config.requireHttps) {
    warnings.push('NODE_ENV=production 但 MARKET_REQUIRE_HTTPS=false：公网部署应强制 HTTPS')
  }
  return warnings
}

const isEntryPoint =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isEntryPoint) {
  loadDotEnv(process.env.MARKET_ENV_FILE || path.join(PROJECT_ROOT, '.env'))

  const app = createMarketServer()
  const { port } = await app.listen()
  const { config, logger } = app

  logger.info('market.started', {
    service: 'boki-market',
    version: config.serviceVersion,
    phase: 'P2',
    market: config.marketName,
    url: config.publicBaseUrl,
    listen: `${config.host}:${port}`,
    dbFile: config.dbFile,
    dataDir: config.dataDir,
    marketId: app.ctx.meta.marketId,
    schemaVersion: app.ctx.meta.schemaVersion,
  })
  for (const warning of bootWarnings(config)) logger.warn('market.warning', { message: warning })

  let closing = false
  const shutdown = async (signal) => {
    if (closing) return
    closing = true
    logger.info('market.stopping', { signal })
    const forceExit = setTimeout(() => process.exit(1), 10_000)
    forceExit.unref()
    try {
      await app.close()
      process.exit(0)
    } catch (error) {
      logger.error('market.stop_failed', { message: error.message })
      process.exit(1)
    }
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}
