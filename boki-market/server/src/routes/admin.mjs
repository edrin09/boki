/**
 * 管理接口（不鉴权，仅限回环地址 / nginx 来源限制）
 *
 * P1 实现在此落地（接入说明 5.2）：
 *   插件元数据 / 上下架 / 分类归属 / 分类 CRUD / 版本登记（zip 上传）
 *   索引候选 / 激活 / 授权签发与吊销 / 订单 / 统计 / 审计
 *
 * 管理接口不设令牌，部署时必须用 MARKET_HOST=127.0.0.1 + nginx 限制来源；
 * 管理接口不应与公共接口共用限流桶。
 */
import fs from 'node:fs'
import path from 'node:path'
import { HttpError, readBodyBuffer, readJsonBody, sendJson } from '../lib/http.mjs'
import { compareSemver, isSemver } from '../lib/semver.mjs'
import * as repo from '../db/repository.mjs'
import {
  IndexValidationError,
  activateSnapshot,
  buildIndexCandidate,
} from '../services/index.mjs'
import {
  assertPublishableCategories,
  createCategory,
  deleteCategory,
  listCategories,
  setPluginCategories,
  updateCategory,
} from '../services/categories.mjs'
import { issueLicense, revokeLicense } from '../services/license.mjs'
import { getStats } from '../services/stats.mjs'
import { resolveZipPath } from '../services/download.mjs'

const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
const TRUST = new Set(['official', 'verified', 'community'])
const PLUGIN_STATUS = new Set(['draft', 'published', 'hidden', 'deprecated'])

function asString(value, field, { required = false, max = 200, pattern } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new HttpError(400, `${field} 不能为空`)
    return null
  }
  if (typeof value !== 'string') throw new HttpError(400, `${field} 必须是字符串`)
  const trimmed = value.trim()
  if (required && !trimmed) throw new HttpError(400, `${field} 不能为空`)
  if (trimmed.length > max) throw new HttpError(400, `${field} 最长 ${max} 个字符`)
  if (pattern && trimmed && !pattern.test(trimmed)) throw new HttpError(400, `${field} 格式不合法`)
  return trimmed || null
}

function asInteger(value, field, { fallback, min, max } = {}) {
  if (value === undefined || value === null || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new HttpError(400, `${field} 必须是 ${min}..${max} 的整数`)
  }
  return parsed
}

function limitParam(url, { fallback = 50, max = 200 } = {}) {
  return asInteger(url.searchParams.get('limit'), 'limit', { fallback, min: 1, max })
}

function offsetParam(url) {
  return asInteger(url.searchParams.get('offset'), 'offset', { fallback: 0, min: 0, max: 1_000_000 })
}

function requirePlugin(ctx, id) {
  const plugin = repo.getPlugin(ctx.db, id)
  if (!plugin) throw new HttpError(404, `插件不存在：${id}`)
  return plugin
}

function validatePrice(value, fallback) {
  return asInteger(value, 'price', { fallback, min: 0, max: 100_000_000 })
}

function validateCurrency(value, fallback = 'CNY') {
  const currency = asString(value, 'currency', { max: 3, pattern: /^[A-Z]{3}$/ }) ?? fallback
  return currency
}

function validateTrust(value, fallback = 'community') {
  const trust = asString(value, 'trust', { max: 16 }) ?? fallback
  if (!TRUST.has(trust)) throw new HttpError(400, 'trust 必须是 official / verified / community')
  return trust
}

function validateLicenseUrl(value) {
  const licenseUrl = asString(value, 'licenseUrl', { max: 500 })
  if (!licenseUrl) return null
  let parsed
  try {
    parsed = new URL(licenseUrl)
  } catch {
    throw new HttpError(400, 'licenseUrl 必须是合法 URL')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new HttpError(400, 'licenseUrl 只允许 http/https')
  }
  return licenseUrl
}

// --------------------------------------------------------------- plugins

async function upsertPlugin(req, res, ctx) {
  const body = await readJsonBody(req, { limit: 64 * 1024 })
  const id = asString(body?.id, 'id', { required: true, max: 64, pattern: PLUGIN_ID_RE })
  const existing = repo.getPlugin(ctx.db, id)

  const name =
    body?.name === undefined ? existing?.name : asString(body.name, 'name', { required: true, max: 120 })
  if (!name) throw new HttpError(400, 'name 不能为空')

  const plugin = {
    id,
    name,
    description:
      body?.description === undefined
        ? (existing?.description ?? null)
        : asString(body.description, 'description', { max: 1000 }),
    trust: body?.trust === undefined ? (existing?.trust ?? 'community') : validateTrust(body.trust),
    license:
      body?.license === undefined ? (existing?.license ?? null) : asString(body.license, 'license', { max: 64 }),
    price: body?.price === undefined ? (existing?.price ?? 0) : validatePrice(body.price, 0),
    currency: body?.currency === undefined ? (existing?.currency ?? 'CNY') : validateCurrency(body.currency),
    licenseUrl: body?.licenseUrl === undefined ? (existing?.licenseUrl ?? null) : validateLicenseUrl(body.licenseUrl),
    status: existing?.status ?? 'draft',
    latestVersion: existing?.latestVersion ?? null,
  }

  const changed =
    !existing ||
    existing.name !== plugin.name ||
    existing.description !== plugin.description ||
    existing.trust !== plugin.trust ||
    existing.license !== plugin.license ||
    existing.price !== plugin.price ||
    existing.currency !== plugin.currency ||
    existing.licenseUrl !== plugin.licenseUrl

  if (changed) {
    const now = new Date().toISOString()
    repo.transaction(ctx.db, () => {
      repo.savePlugin(ctx.db, plugin, now)
      repo.bumpDataVersion(ctx.db, now)
      repo.insertAudit(ctx.db, {
        actor: 'admin',
        action: existing ? 'plugin.update' : 'plugin.create',
        target: id,
        detail: { name: plugin.name, trust: plugin.trust, price: plugin.price },
        createdAt: now,
      })
    })
  }

  sendJson(res, existing ? 200 : 201, repo.getPlugin(ctx.db, id))
}

async function updatePluginStatus(req, res, ctx, id) {
  const body = await readJsonBody(req, { limit: 8 * 1024 })
  const status = asString(body?.status, 'status', { required: true, max: 16 })
  if (!PLUGIN_STATUS.has(status)) {
    throw new HttpError(400, 'status 必须是 draft / published / hidden / deprecated')
  }
  return setStatus(ctx, id, status, res)
}

function setStatus(ctx, id, status, res) {
  const plugin = requirePlugin(ctx, id)
  if (status === 'published') {
    if (!plugin.latestVersion) throw new HttpError(409, '上架前必须至少登记一个版本（POST /v1/admin/releases）')
    const version = repo.getVersion(ctx.db, id, plugin.latestVersion)
    if (!version || version.revokedAt) throw new HttpError(409, '最新版本不存在或已吊销，不能上架')
    assertPublishableCategories(ctx, id)
    const zipPath = resolveZipPath(ctx.config.dataDir, version.zipPath)
    if (!zipPath || !fs.existsSync(zipPath)) {
      throw new HttpError(409, '插件包文件缺失，不能上架；请先重新上传制品')
    }
  }

  if (plugin.status !== status) {
    const now = new Date().toISOString()
    repo.transaction(ctx.db, () => {
      repo.setPluginStatus(ctx.db, id, status, now)
      repo.bumpDataVersion(ctx.db, now)
      repo.insertAudit(ctx.db, {
        actor: 'admin',
        action: 'plugin.status',
        target: id,
        detail: { from: plugin.status, to: status },
        createdAt: now,
      })
    })
  }

  sendJson(res, 200, repo.getPlugin(ctx.db, id))
}

async function updatePluginCategories(req, res, ctx, id) {
  const body = await readJsonBody(req, { limit: 16 * 1024 })
  sendJson(res, 200, setPluginCategories(ctx, id, body))
}

// --------------------------------------------------------------- releases

function parseEngines(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('not an object')
      }
      return parsed
    } catch {
      throw new HttpError(400, 'engines 必须是 JSON 对象，例如 {"boki":">=1.0.0"}')
    }
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'engines 必须是对象')
  }
  return value
}

async function createRelease(req, res, ctx, url) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase()
  const isJson = contentType.includes('application/json')
  let meta
  let zip

  if (isJson) {
    const limit = Math.ceil((ctx.config.maxUploadBytes * 4) / 3) + 64 * 1024
    meta = await readJsonBody(req, { limit })
    if (!meta?.zipBase64) throw new HttpError(400, 'JSON 模式必须提供 zipBase64（或改用 application/zip 原始上传）')
    try {
      zip = Buffer.from(String(meta.zipBase64), 'base64')
    } catch {
      throw new HttpError(400, 'zipBase64 不是合法 base64')
    }
  } else {
    zip = await readBodyBuffer(req, { limit: ctx.config.maxUploadBytes })
    meta = {
      pluginId: url.searchParams.get('pluginId'),
      version: url.searchParams.get('version'),
      apiVersion: url.searchParams.get('apiVersion'),
      engines: url.searchParams.get('engines'),
      publishedAt: url.searchParams.get('publishedAt'),
      signature: url.searchParams.get('signature'),
    }
  }

  const pluginId = asString(meta?.pluginId, 'pluginId', { required: true, max: 64, pattern: PLUGIN_ID_RE })
  const version = asString(meta?.version, 'version', { required: true, max: 64 })
  if (!isSemver(version)) throw new HttpError(400, 'version 必须是 SemVer，例如 1.2.0')
  const apiVersion = asString(meta?.apiVersion, 'apiVersion', { required: true, max: 64 })
  const engines = parseEngines(meta?.engines)
  const signature = asString(meta?.signature, 'signature', { max: 4096 })

  let publishedAt = meta?.publishedAt ? String(meta.publishedAt) : new Date().toISOString()
  if (Number.isNaN(Date.parse(publishedAt))) throw new HttpError(400, 'publishedAt 不是合法时间')
  publishedAt = new Date(Date.parse(publishedAt)).toISOString()

  if (!zip?.length) throw new HttpError(400, 'zip 内容为空')
  if (zip.length > ctx.config.maxUploadBytes) throw new HttpError(413, 'zip 超过 MARKET_MAX_UPLOAD_BYTES')

  const plugin = requirePlugin(ctx, pluginId)
  if (repo.getVersion(ctx.db, pluginId, version)) {
    throw new HttpError(409, `版本已存在，禁止同版本换包：${pluginId}@${version}`)
  }

  const sha256 = repo.sha256Hex(zip)
  const declaredSha = String(meta?.sha256 || req.headers['x-plugin-sha256'] || '').trim().toLowerCase()
  if (declaredSha && declaredSha !== sha256) {
    throw new HttpError(400, 'sha256 与上传内容不一致')
  }

  const relativeZipPath = `plugins/${pluginId}-${version}.zip`
  const target = resolveZipPath(ctx.config.dataDir, relativeZipPath)
  if (!target) throw new HttpError(400, '制品路径不合法')

  // 同版本已登记时上面已拒绝；这里只清理「上次写文件成功但入库失败」留下的孤儿文件
  if (fs.existsSync(target)) {
    ctx.logger?.warn('release.orphan_overwrite', { file: relativeZipPath })
    fs.rmSync(target, { force: true })
  }

  fs.mkdirSync(path.dirname(target), { recursive: true })
  const temp = path.join(path.dirname(target), `.upload-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`)
  fs.writeFileSync(temp, zip)
  fs.renameSync(temp, target)

  const now = new Date().toISOString()
  try {
    repo.transaction(ctx.db, () => {
      repo.insertVersion(ctx.db, {
        pluginId,
        version,
        apiVersion,
        engines,
        sha256,
        size: zip.length,
        zipPath: relativeZipPath,
        signature,
        publishedAt,
      })
      if (!plugin.latestVersion || compareSemver(version, plugin.latestVersion) > 0) {
        repo.setLatestVersion(ctx.db, pluginId, version, now)
      }
      repo.bumpDataVersion(ctx.db, now)
      repo.insertAudit(ctx.db, {
        actor: 'admin',
        action: 'release.create',
        target: `${pluginId}@${version}`,
        detail: { sha256, size: zip.length, apiVersion, engines, publishedAt },
        createdAt: now,
      })
    })
  } catch (error) {
    fs.rmSync(target, { force: true })
    throw error
  }

  sendJson(res, 201, {
    pluginId,
    version,
    apiVersion,
    engines,
    sha256,
    size: zip.length,
    zipPath: relativeZipPath,
    publishedAt,
  })
}

// ----------------------------------------------------- index / categories

function indexCandidate(res, ctx) {
  try {
    const candidate = buildIndexCandidate(ctx)
    sendJson(res, 200, {
      snapshotVersion: candidate.snapshotVersion,
      publishedAt: candidate.publishedAt,
      contentHash: candidate.contentHash,
      pluginCount: candidate.pluginCount,
      categoryCount: candidate.categoryCount,
      raw: candidate.raw.toString('utf8'),
    })
  } catch (error) {
    if (error instanceof IndexValidationError) {
      throw new HttpError(422, error.message, { detail: { problems: error.problems } })
    }
    throw error
  }
}

async function activateIndex(req, res, ctx) {
  const body = await readJsonBody(req, { limit: 4 * 1024 * 1024 })
  sendJson(res, 200, activateSnapshot(ctx, body))
}

async function createCategoryRoute(req, res, ctx) {
  const body = await readJsonBody(req, { limit: 16 * 1024 })
  sendJson(res, 201, createCategory(ctx, body))
}

async function updateCategoryRoute(req, res, ctx, id) {
  const body = await readJsonBody(req, { limit: 16 * 1024 })
  sendJson(res, 200, updateCategory(ctx, id, body))
}

function deleteCategoryRoute(res, ctx, id) {
  sendJson(res, 200, deleteCategory(ctx, id))
}

// --------------------------------------------------------------- licenses

async function issueLicenseRoute(req, res, ctx) {
  const body = await readJsonBody(req, { limit: 16 * 1024 })
  sendJson(res, 201, issueLicense(ctx, body))
}

function revokeLicenseRoute(res, ctx, id) {
  sendJson(res, 200, revokeLicense(ctx, id))
}

// ----------------------------------------------------------------- router

/** @returns {Promise<boolean>} 是否已处理该请求 */
export async function handleAdmin(req, res, ctx) {
  const url = new URL(req.url, 'http://market.local')
  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    sendJson(res, 400, { code: 400, message: '请求路径编码不合法' })
    return true
  }
  if (!pathname.startsWith('/v1/admin')) return false

  let match
  if (req.method === 'POST' && pathname === '/v1/admin/plugins') {
    await upsertPlugin(req, res, ctx)
    return true
  }
  if (req.method === 'PUT' && (match = pathname.match(/^\/v1\/admin\/plugins\/([a-z0-9][a-z0-9-]*)\/status$/))) {
    await updatePluginStatus(req, res, ctx, match[1])
    return true
  }
  if (req.method === 'PUT' && (match = pathname.match(/^\/v1\/admin\/plugins\/([a-z0-9][a-z0-9-]*)\/categories$/))) {
    await updatePluginCategories(req, res, ctx, match[1])
    return true
  }
  if (req.method === 'POST' && pathname === '/v1/admin/releases') {
    await createRelease(req, res, ctx, url)
    return true
  }
  if (req.method === 'GET' && pathname === '/v1/admin/index/candidate') {
    indexCandidate(res, ctx)
    return true
  }
  if (req.method === 'POST' && pathname === '/v1/admin/index/activate') {
    await activateIndex(req, res, ctx)
    return true
  }
  if (req.method === 'GET' && pathname === '/v1/admin/categories') {
    sendJson(res, 200, listCategories(ctx))
    return true
  }
  if (req.method === 'POST' && pathname === '/v1/admin/categories') {
    await createCategoryRoute(req, res, ctx)
    return true
  }
  if (req.method === 'PATCH' && (match = pathname.match(/^\/v1\/admin\/categories\/([a-z0-9][a-z0-9-]*)$/))) {
    await updateCategoryRoute(req, res, ctx, match[1])
    return true
  }
  if (req.method === 'DELETE' && (match = pathname.match(/^\/v1\/admin\/categories\/([a-z0-9][a-z0-9-]*)$/))) {
    deleteCategoryRoute(res, ctx, match[1])
    return true
  }
  if (req.method === 'POST' && pathname === '/v1/admin/licenses') {
    await issueLicenseRoute(req, res, ctx)
    return true
  }
  if (req.method === 'POST' && (match = pathname.match(/^\/v1\/admin\/licenses\/([^/]+)\/revoke$/))) {
    revokeLicenseRoute(res, ctx, decodeURIComponent(match[1]))
    return true
  }
  if (req.method === 'GET' && pathname === '/v1/admin/orders') {
    sendJson(res, 200, {
      orders: repo.listOrders(ctx.db, {
        status: url.searchParams.get('status') || undefined,
        limit: limitParam(url),
        offset: offsetParam(url),
      }),
    })
    return true
  }
  if (req.method === 'GET' && pathname === '/v1/admin/stats') {
    sendJson(res, 200, getStats(ctx))
    return true
  }
  if (req.method === 'GET' && pathname === '/v1/admin/audit') {
    sendJson(res, 200, {
      audit: repo.listAudit(ctx.db, {
        action: url.searchParams.get('action') || undefined,
        limit: limitParam(url),
        offset: offsetParam(url),
      }),
    })
    return true
  }

  sendJson(res, 404, { code: 404, message: 'Not Found' })
  return true
}
