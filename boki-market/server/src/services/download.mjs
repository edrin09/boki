/**
 * 下载解析：索引白名单 + 授权闸门 + 目录穿越防护
 *
 * 只发激活索引里登记过的 (pluginId, version)：
 *   - 索引里有 → 再查库确认 zip_path / sha256 / size；
 *   - 索引里没有 → 404（即使库里有未激活的新版本）；
 *   - 收费插件先验授权（402），成功才返回文件信息。
 */
import fs from 'node:fs'
import path from 'node:path'
import { getActiveIndex } from './index.mjs'
import { verifyLicenseCode } from './license.mjs'
import * as repo from '../db/repository.mjs'

const ZIP_RELATIVE_RE = /^plugins\/[A-Za-z0-9][A-Za-z0-9._+-]*\.zip$/

export const SNAPSHOT_NOT_READY = '市场索引尚未发布（等待激活已签名快照）'

/**
 * 把库内 zip_path 解析成绝对路径，并确保仍在 MARKET_DATA_DIR/plugins/ 内。
 * 非法路径返回 null（由调用方按 404 处理，不泄漏服务器目录结构）。
 */
export function resolveZipPath(dataDir, zipPath) {
  if (typeof zipPath !== 'string' || !zipPath) return null
  if (zipPath.includes('\0')) return null

  const normalized = zipPath.replace(/\\/g, '/')
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) return null

  const relative = path.posix.normalize(normalized)
  if (relative === '..' || relative.startsWith('../') || relative.includes('/../')) return null
  if (!ZIP_RELATIVE_RE.test(relative)) return null

  const root = path.resolve(dataDir)
  const full = path.resolve(root, relative.split('/').join(path.sep))
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`
  const inside =
    process.platform === 'win32'
      ? full.toLowerCase().startsWith(rootWithSep.toLowerCase())
      : full.startsWith(rootWithSep)
  return inside ? full : null
}

export function licenseErrorMessage(reason) {
  switch (reason) {
    case 'expired':
      return '授权码已过期，请续费后下载'
    case 'revoked':
      return '授权已吊销，无法下载或更新'
    case 'license-not-configured':
      return '市场未配置授权密钥，收费插件暂不可下载'
    case 'plugin-mismatch':
      return '授权码不属于该插件'
    default:
      return '需要有效授权码，请购买后安装'
  }
}

/**
 * @returns {{status: 200, filePath: string, size: number, filename: string, sha256: string,
 *            pluginId: string, version: string, licenseId: string|null, price: number}
 *          | {status: 402|404|409|503, message: string, reason?: string}}
 */
export function resolveDownload(ctx, { pluginId, version, licenseKey } = {}) {
  const snapshot = getActiveIndex(ctx)
  if (!snapshot) return { status: 503, message: SNAPSHOT_NOT_READY }

  const entries = Array.isArray(snapshot.json?.plugins) ? snapshot.json.plugins : []
  const entry = entries.find((item) => item.id === pluginId && (!version || item.version === version))
  if (!entry) return { status: 404, message: '插件不存在或版本不匹配' }

  const row = repo.getVersion(ctx.db, pluginId, entry.version)
  if (!row || row.revokedAt) {
    return { status: 404, message: '插件版本不存在或已吊销' }
  }
  if (row.sha256 !== entry.sha256 || Number(row.size) !== Number(entry.size)) {
    ctx.logger?.error('download.integrity_mismatch', {
      pluginId,
      version: entry.version,
      dbSha256: row.sha256,
      indexSha256: entry.sha256,
    })
    return { status: 409, message: '索引登记与库内制品不一致，请联系市场方' }
  }

  let licenseId = null
  if (Number(entry.price) > 0) {
    const check = verifyLicenseCode(ctx, { key: licenseKey, pluginId })
    if (!check.available || !check.valid) {
      return {
        status: 402,
        reason: check.available ? check.reason : 'license-not-configured',
        message: licenseErrorMessage(check.available ? check.reason : 'license-not-configured'),
      }
    }
    licenseId = check.licenseId
  }

  const filePath = resolveZipPath(ctx.config.dataDir, row.zipPath)
  if (!filePath) {
    ctx.logger?.error('download.bad_path', { pluginId, version: entry.version, zipPath: row.zipPath })
    return { status: 404, message: '插件包文件缺失，请联系市场方' }
  }

  let stat
  try {
    stat = fs.statSync(filePath)
  } catch {
    ctx.logger?.error('download.missing_file', { pluginId, version: entry.version })
    return { status: 404, message: '插件包文件缺失，请联系市场方' }
  }
  if (Number(stat.size) !== Number(row.size)) {
    ctx.logger?.error('download.size_mismatch', {
      pluginId,
      version: entry.version,
      dbSize: row.size,
      fileSize: stat.size,
    })
    return { status: 409, message: '制品大小与登记不一致，请联系市场方' }
  }

  return {
    status: 200,
    filePath,
    size: Number(stat.size),
    filename: `${pluginId}-${entry.version}.zip`,
    sha256: row.sha256,
    pluginId,
    version: entry.version,
    licenseId,
    price: Number(entry.price),
  }
}
