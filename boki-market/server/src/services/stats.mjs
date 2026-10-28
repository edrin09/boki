/**
 * 下载统计：异步批量写入
 *
 * SQLite 是单写者。下载是高频路径，不能在请求里同步写事件表；
 * 这里在进程内排队，按「条数阈值 / 时间阈值」批量落库，失败回队列重试。
 * 进程退出前由 main.mjs 调用 close() 强制 flush。
 */
import crypto from 'node:crypto'
import { clientIp } from '../lib/http.mjs'
import {
  countLicensesByStatus,
  countPluginsByStatus,
  downloadEventCounts,
  downloadsByPlugin,
  downloadsLast24h,
  insertDownloadEvents,
  orderTotals,
  versionTotals,
} from '../db/repository.mjs'
import { isSnapshotStale } from './index.mjs'
import * as repo from '../db/repository.mjs'

export function hashIp(ip, salt) {
  return crypto
    .createHash('sha256')
    .update(String(salt ?? ''))
    .update('|')
    .update(String(ip ?? 'unknown'))
    .digest('hex')
}

export function createStatsWriter({
  db,
  logger,
  flushMs = 1_000,
  batchSize = 50,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  let queue = []
  let timer = null
  let closed = false

  function flush() {
    if (!queue.length) return 0
    const batch = queue
    queue = []
    try {
      const written = insertDownloadEvents(db, batch)
      logger?.debug?.('stats.flushed', { events: written })
      return written
    } catch (error) {
      logger?.error?.('stats.flush_failed', { events: batch.length, message: error.message })
      // 回队列，但限制上限，避免库持续不可写时无限膨胀
      queue = [...batch, ...queue].slice(-1_000)
      return 0
    }
  }

  function schedule() {
    if (closed || timer || !queue.length) return
    timer = setTimer(() => {
      timer = null
      flush()
      schedule()
    }, flushMs)
    timer?.unref?.()
  }

  return {
    record(event) {
      if (closed) return
      queue.push({ createdAt: new Date(now()).toISOString(), ...event })
      if (queue.length >= batchSize) flush()
      else schedule()
    },
    flush,
    close() {
      closed = true
      if (timer) clearTimer(timer)
      timer = null
      flush()
    },
    get pending() {
      return queue.length
    },
  }
}

/** 公共接口调用：记录一次下载尝试（成功 / 402 / 404 …） */
export function recordDownload(ctx, req, { pluginId, version, status, licenseId = null }) {
  ctx.stats?.record({
    pluginId,
    version: version || '',
    status,
    licenseId,
    ipHash: hashIp(clientIp(req, { trustProxy: ctx.config.trustProxy }), ctx.config.ipHashSalt),
    ua: String(req.headers['user-agent'] || '').slice(0, 200) || null,
  })
}

/** 管理端统计（P1 基础版；订单/收入在 P5 完善） */
export function getStats(ctx) {
  const pluginCounts = countPluginsByStatus(ctx.db)
  const pluginsTotal = Object.values(pluginCounts).reduce((sum, value) => sum + value, 0)
  const versions = versionTotals(ctx.db)
  const downloads = downloadEventCounts(ctx.db)
  const licenses = countLicensesByStatus(ctx.db)
  const orders = orderTotals(ctx.db)
  const active = repo.getActiveSnapshotRow(ctx.db)
  const licensesTotal = Object.values(licenses).reduce((sum, value) => sum + value, 0)

  return {
    plugins: {
      total: pluginsTotal,
      draft: pluginCounts.draft ?? 0,
      published: pluginCounts.published ?? 0,
      hidden: pluginCounts.hidden ?? 0,
      deprecated: pluginCounts.deprecated ?? 0,
    },
    versions,
    downloads: {
      total: downloads.total,
      ok: downloads.byStatus['200'] ?? 0,
      unauthorized: downloads.byStatus['402'] ?? 0,
      notFound: downloads.byStatus['404'] ?? 0,
      conflict: downloads.byStatus['409'] ?? 0,
      last24h: downloadsLast24h(ctx.db),
      byPlugin: downloadsByPlugin(ctx.db),
    },
    licenses: {
      total: licensesTotal,
      active: licenses.active ?? 0,
      revoked: licenses.revoked ?? 0,
      expired: licenses.expired ?? 0,
    },
    orders,
    snapshot: active
      ? {
          active: true,
          version: active.version,
          publishedAt: active.publishedAt,
          keyId: active.keyId,
          pluginCount: active.pluginCount,
          stale: isSnapshotStale(ctx),
        }
      : { active: false, version: null, publishedAt: null, keyId: null, pluginCount: 0, stale: false },
    pendingEvents: ctx.stats?.pending ?? 0,
  }
}
