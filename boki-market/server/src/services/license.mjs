/**
 * 授权服务：授权码 HMAC 验签 + 查库 + 吊销 / 过期判断
 *
 * 授权码格式（与旧 market-server 兼容）：
 *   v1.<base64url(payload)>.<base64url(hmac-sha256(secret, payloadB64))>
 * payload: { pid, plan: 'perpetual'|'subscription', exp: 0|unixTs, sub, iat }
 *
 * 库内只存授权码的 SHA-256（key_hash），不存明文；吊销只影响新下载与更新，
 * 已安装插件继续可用。
 */
import crypto from 'node:crypto'
import { HttpError } from '../lib/http.mjs'
import * as repo from '../db/repository.mjs'

const PLANS = new Set(['perpetual', 'subscription'])

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function hmac(secret, payloadB64) {
  return crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url')
}

export function buildLicenseKey({ secret, payload }) {
  if (!secret) throw new Error('MARKET_LICENSE_SECRET 未配置')
  const payloadB64 = base64urlJson(payload)
  return `v1.${payloadB64}.${hmac(secret, payloadB64)}`
}

export function hashLicenseKey(key) {
  return repo.sha256Hex(String(key ?? ''))
}

function invalid(reason, extra = {}) {
  return { available: true, valid: false, reason, ...extra }
}

/**
 * @param {{key: string, pluginId?: string}} input
 * @returns {{available: false, reason: string} | {available: true, valid: boolean, reason?: string, ...}}
 */
export function verifyLicenseCode(ctx, { key, pluginId } = {}) {
  const secret = ctx.config.licenseSecret
  if (!secret) return { available: false, reason: 'license-not-configured' }

  const parts = String(key ?? '').split('.')
  if (parts.length !== 3 || parts[0] !== 'v1' || !parts[1] || !parts[2]) {
    return invalid('bad-format')
  }

  const [, payloadB64, signatureB64] = parts
  const expected = hmac(secret, payloadB64)
  const got = Buffer.from(signatureB64, 'base64url')
  const want = Buffer.from(expected, 'base64url')
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) {
    return invalid('bad-signature')
  }

  let payload
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  } catch {
    return invalid('bad-payload')
  }
  if (!payload || typeof payload.pid !== 'string') return invalid('bad-payload')
  if (pluginId && payload.pid !== pluginId) return invalid('plugin-mismatch')
  if (payload.exp && Number(payload.exp) * 1000 < Date.now()) return invalid('expired')

  // 签名通过还不够：必须存在于授权表，才能吊销与审计
  const record = repo.getLicenseByHash(ctx.db, hashLicenseKey(key))
  if (!record) return invalid('unknown-license')
  if (record.pluginId !== payload.pid || (pluginId && record.pluginId !== pluginId)) {
    return invalid('plugin-mismatch')
  }
  if (record.status === 'revoked') return invalid('revoked')
  if (record.status === 'expired') return invalid('expired')
  if (record.expiresAt && Date.parse(record.expiresAt) < Date.now()) return invalid('expired')

  return {
    available: true,
    valid: true,
    licenseId: record.id,
    pluginId: record.pluginId,
    plan: record.plan,
    expiresAt: record.expiresAt,
  }
}

export function issueLicense(ctx, input) {
  if (!ctx.config.licenseSecret) {
    throw new HttpError(503, '未配置 MARKET_LICENSE_SECRET，无法签发授权')
  }

  const pluginId = String(input?.pluginId ?? '').trim()
  if (!pluginId) throw new HttpError(400, 'pluginId 不能为空')
  const plugin = repo.getPlugin(ctx.db, pluginId)
  if (!plugin) throw new HttpError(404, `插件不存在：${pluginId}`)

  const plan = String(input?.plan ?? 'perpetual')
  if (!PLANS.has(plan)) throw new HttpError(400, 'plan 必须是 perpetual 或 subscription')

  let expiresAt = null
  if (input?.expiresAt) {
    const timestamp = Date.parse(input.expiresAt)
    if (Number.isNaN(timestamp)) throw new HttpError(400, 'expiresAt 不是合法时间')
    if (timestamp <= Date.now()) throw new HttpError(400, 'expiresAt 必须晚于当前时间')
    expiresAt = new Date(timestamp).toISOString()
  } else if (plan === 'subscription') {
    throw new HttpError(400, '订阅授权必须提供 expiresAt')
  }

  const id = `lic_${crypto.randomUUID()}`
  const issuedAt = new Date().toISOString()
  const payload = {
    pid: pluginId,
    plan,
    exp: expiresAt ? Math.floor(Date.parse(expiresAt) / 1000) : 0,
    sub: id,
    iat: Math.floor(Date.parse(issuedAt) / 1000),
  }
  const key = buildLicenseKey({ secret: ctx.config.licenseSecret, payload })
  const record = repo.transaction(ctx.db, () => {
    const created = repo.insertLicense(
      ctx.db,
      {
        id,
        keyHash: hashLicenseKey(key),
        pluginId,
        plan,
        status: 'active',
        expiresAt,
        orderId: input?.orderId ?? null,
        buyerRef: input?.buyerRef ?? null,
      },
      issuedAt,
    )
    repo.insertAudit(ctx.db, {
      actor: 'admin',
      action: 'license.issue',
      target: id,
      detail: { pluginId, plan, expiresAt, orderId: input?.orderId ?? null },
      createdAt: issuedAt,
    })
    return created
  })

  // 明文授权码只在此处返回一次；库里只有哈希（绝不返回 keyHash）
  return {
    id: record.id,
    pluginId: record.pluginId,
    plan: record.plan,
    status: record.status,
    orderId: record.orderId,
    buyerRef: record.buyerRef,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
    key,
  }
}

export function revokeLicense(ctx, id) {
  const existing = repo.getLicenseById(ctx.db, id)
  if (!existing) throw new HttpError(404, `授权不存在：${id}`)
  if (existing.status === 'revoked') return existing

  const revokedAt = new Date().toISOString()
  repo.transaction(ctx.db, () => {
    repo.revokeLicenseRow(ctx.db, id, revokedAt)
    repo.insertAudit(ctx.db, {
      actor: 'admin',
      action: 'license.revoke',
      target: id,
      detail: { pluginId: existing.pluginId, plan: existing.plan },
      createdAt: revokedAt,
    })
  })
  return repo.getLicenseById(ctx.db, id)
}
