/**
 * 公共接口（客户端 / 下载用）
 *
 * P1 状态：
 *   GET  /v1/health                 库连通 + 迁移版本 + 快照状态 + snapshotStale
 *   GET  /v1/index                  返回激活快照的原始字节（ETag / 304）
 *   GET  /v1/plugins/:id/download   索引白名单 + 授权闸门 + 目录穿越防护 + 计数
 *   GET  /v1/plugins/:id            激活快照里的插件详情
 *   POST /v1/license/verify         授权码验签 + 查库 + 吊销/过期
 */
import fs from 'node:fs'
import path from 'node:path'
import { etagMatches } from '../lib/etag.mjs'
import { readJsonBody, sendEmpty, sendJson } from '../lib/http.mjs'
import { currentSchemaVersion } from '../db/migrate.mjs'
import { getActiveIndex, isSnapshotStale } from '../services/index.mjs'
import { resolveDownload, SNAPSHOT_NOT_READY } from '../services/download.mjs'
import { verifyLicenseCode } from '../services/license.mjs'
import { getPluginDetail } from '../services/catalog.mjs'
import { recordDownload } from '../services/stats.mjs'

const VERSION_RE = /^[0-9A-Za-z.+-]{1,64}$/

function safeDecode(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

function readSnapshot(ctx) {
  try {
    return getActiveIndex(ctx)
  } catch (error) {
    ctx.logger.error('index.snapshot_failed', { message: error.message })
    return null
  }
}

function health(res, ctx) {
  let dbOk = true
  let schemaVersion = null
  let dbError = null
  let stale = false
  try {
    ctx.db.prepare('SELECT 1 AS ok').get()
    schemaVersion = currentSchemaVersion(ctx.db)
    stale = isSnapshotStale(ctx)
  } catch (error) {
    dbOk = false
    dbError = error.message
  }

  const snapshot = dbOk ? readSnapshot(ctx) : null
  const body = {
    ok: dbOk,
    service: 'boki-market',
    version: ctx.config.serviceVersion,
    phase: 'P2',
    ts: new Date().toISOString(),
    uptimeSec: Math.round((Date.now() - ctx.startedAt) / 1000),
    db: {
      ok: dbOk,
      schemaVersion,
      ...(dbError ? { error: dbError } : {}),
    },
    snapshotStale: stale,
    snapshot: snapshot
      ? {
          active: true,
          version: snapshot.version,
          publishedAt: snapshot.publishedAt,
          keyId: snapshot.keyId ?? null,
          pluginCount: snapshot.pluginCount,
          stale,
        }
      : { active: false, version: null, publishedAt: null, keyId: null, pluginCount: 0, stale: false },
    marketId: ctx.meta?.marketId ?? null,
    market: ctx.config.marketName,
  }

  sendJson(res, dbOk ? 200 : 503, body)
}

function index(req, res, ctx) {
  const snapshot = readSnapshot(ctx)
  if (!snapshot) return sendJson(res, 503, { code: 503, message: SNAPSHOT_NOT_READY })

  // 客户端验签所需的随行头：签名原文不变（不解码 / 不重排），
  // signature 为服务端激活时保存的 detached Ed25519 签名（base64）。
  const signHeaders = {
    'X-Boki-Key-Id': snapshot.keyId,
    'X-Boki-Signature': snapshot.signature,
  }

  if (etagMatches(req.headers['if-none-match'], snapshot.etag)) {
    return sendEmpty(res, 304, { ETag: snapshot.etag, ...signHeaders })
  }

  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
    ETag: snapshot.etag,
    'Content-Length': snapshot.raw.length,
    ...signHeaders,
  })
  res.end(snapshot.raw)
}

function streamFile(req, res, ctx, file) {
  let finished = false
  res.on('finish', () => {
    if (finished) return
    finished = true
    recordDownload(ctx, req, {
      pluginId: file.pluginId,
      version: file.version,
      status: 200,
      licenseId: file.licenseId,
    })
  })

  res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${path.basename(file.filename)}"`,
    'Content-Length': file.size,
    'Cache-Control': 'no-store',
  })
  fs.createReadStream(file.filePath)
    .on('error', (error) => {
      ctx.logger.error('download.stream_failed', { message: error.message })
      if (!finished) {
        finished = true
        recordDownload(ctx, req, {
          pluginId: file.pluginId,
          version: file.version,
          status: 500,
          licenseId: file.licenseId,
        })
      }
      res.destroy(error)
    })
    .pipe(res)
}

function download(req, res, ctx, url, pluginId) {
  const version = url.searchParams.get('version') || ''
  if (version && !VERSION_RE.test(version)) {
    return sendJson(res, 400, { code: 400, message: 'version 参数不合法' })
  }

  const licenseKey = url.searchParams.get('license') || req.headers['x-license-key'] || ''
  const resolved = resolveDownload(ctx, { pluginId, version, licenseKey })

  if (resolved.status !== 200) {
    if (resolved.status !== 503) {
      recordDownload(ctx, req, { pluginId, version, status: resolved.status })
    }
    return sendJson(res, resolved.status, {
      code: resolved.status,
      message: resolved.message,
      ...(resolved.reason ? { reason: resolved.reason } : {}),
    })
  }

  return streamFile(req, res, ctx, resolved)
}

async function licenseVerify(req, res, ctx) {
  const body = await readJsonBody(req, { limit: 4 * 1024 })
  const result = verifyLicenseCode(ctx, {
    key: typeof body?.key === 'string' ? body.key : '',
    pluginId: typeof body?.pluginId === 'string' ? body.pluginId : '',
  })

  if (!result.available) {
    return sendJson(res, 501, {
      code: 501,
      message: '授权校验未启用：未配置 MARKET_LICENSE_SECRET',
      reason: result.reason,
    })
  }

  const { available, ...payload } = result
  sendJson(res, 200, payload)
}

function pluginDetail(res, ctx, pluginId) {
  const detail = getPluginDetail(ctx, pluginId)
  if (detail.status !== 200) {
    return sendJson(res, detail.status, { code: detail.status, message: detail.message })
  }
  sendJson(res, 200, detail.plugin)
}

/** @returns {Promise<boolean>} 是否已处理该请求 */
export async function handlePublic(req, res, ctx) {
  const url = new URL(req.url, 'http://market.local')
  const pathname = safeDecode(url.pathname)
  if (pathname === null) {
    sendJson(res, 400, { code: 400, message: '请求路径编码不合法' })
    return true
  }

  if (req.method === 'GET' && pathname === '/v1/health') {
    health(res, ctx)
    return true
  }

  if (req.method === 'GET' && pathname === '/v1/index') {
    index(req, res, ctx)
    return true
  }

  const downloadMatch = pathname.match(/^\/v1\/plugins\/([a-z0-9][a-z0-9-]*)\/download$/)
  if (req.method === 'GET' && downloadMatch) {
    download(req, res, ctx, url, downloadMatch[1])
    return true
  }

  const detailMatch = pathname.match(/^\/v1\/plugins\/([a-z0-9][a-z0-9-]*)$/)
  if (req.method === 'GET' && detailMatch) {
    pluginDetail(res, ctx, detailMatch[1])
    return true
  }

  if (req.method === 'POST' && pathname === '/v1/license/verify') {
    await licenseVerify(req, res, ctx)
    return true
  }

  return false
}
