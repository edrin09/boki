/**
 * 索引服务：读取激活快照、生成候选、校验并激活
 *
 * 关键约束（接入说明 5.3 / 6）：
 *   - /v1/index 返回签名时的原始字节，不重排 JSON；
 *   - 候选生成只读库，失败时指出具体插件（422）；
 *   - 激活必须：公钥验签 → 版本/publishedAt 单调 → 与库内当前数据一致；
 *   - 分类只影响展示，不参与加载/依赖/权限判断。
 */
import { isDeepStrictEqual } from 'node:util'
import { etagFor } from '../lib/etag.mjs'
import { HttpError } from '../lib/http.mjs'
import { verifyDetachedSignature } from '../lib/signature.mjs'
import * as repo from '../db/repository.mjs'

export const INDEX_FORMAT_VERSION = 2
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024

export class IndexValidationError extends Error {
  constructor(problems) {
    const names = problems.map((item) => item.pluginId || item.categoryId || '?').join(', ')
    super(`索引候选校验失败：${names}`)
    this.name = 'IndexValidationError'
    this.problems = problems
  }
}

function dbDataVersion(db) {
  try {
    return Number(db.prepare('PRAGMA data_version').get().data_version ?? 0)
  } catch {
    return 0
  }
}

/** 清空进程内缓存（激活、手工改库后调用） */
export function invalidateSnapshotCache(ctx) {
  ctx.snapshotCache = undefined
}

/**
 * 当前激活快照（含解析后的 JSON 与 ETag）。
 * 返回 null 表示尚未发布任何快照，路由层回 503。
 */
export function getActiveIndex(ctx) {
  const dataVersion = dbDataVersion(ctx.db)
  if (ctx.snapshotCache !== undefined && ctx.snapshotCache.dbDataVersion === dataVersion) {
    return ctx.snapshotCache.snapshot
  }

  const row = repo.getActiveSnapshotRow(ctx.db)
  if (!row) {
    ctx.snapshotCache = { snapshot: null, dbDataVersion: dataVersion }
    return null
  }

  let json
  try {
    json = JSON.parse(row.raw.toString('utf8'))
  } catch (error) {
    throw new Error(`激活快照 JSON 无法解析：${error.message}`)
  }

  const snapshot = {
    id: row.id,
    version: row.version,
    publishedAt: row.publishedAt,
    raw: row.raw,
    etag: etagFor(row.raw),
    signature: row.signature,
    keyId: row.keyId,
    contentHash: row.contentHash,
    dataVersion: row.dataVersion,
    pluginCount: row.pluginCount,
    json,
  }
  ctx.snapshotCache = { snapshot, dbDataVersion: dataVersion }
  return snapshot
}

/** 兼容旧命名（P0 的 routes 曾直接引用） */
export const getActiveSnapshot = getActiveIndex

/** 库已改但快照未重新激活 → true（/v1/health 使用） */
export function isSnapshotStale(ctx) {
  const active = repo.getActiveSnapshotRow(ctx.db)
  if (!active) return false
  return active.dataVersion !== repo.getDataVersion(ctx.db)
}

function categoryEntry(category) {
  return {
    id: category.id,
    name: category.name,
    parentId: category.parentId,
    sort: category.sort,
    icon: category.icon,
  }
}

function pluginEntry(plugin, version, assignment, primary, categoriesById, ctx) {
  const categoryIds = assignment
    .map((item) => item.categoryId)
    .sort((a, b) => {
      const left = categoriesById.get(a)
      const right = categoriesById.get(b)
      return (left?.sort ?? 0) - (right?.sort ?? 0) || a.localeCompare(b)
    })

  return {
    id: plugin.id,
    version: version.version,
    apiVersion: version.apiVersion,
    engines: version.engines ?? null,
    name: plugin.name,
    description: plugin.description,
    trust: plugin.trust,
    license: plugin.license,
    price: plugin.price,
    currency: plugin.currency,
    licenseUrl: plugin.licenseUrl,
    category: primary.categoryId,
    categories: categoryIds,
    download: `${ctx.config.publicBaseUrl}/v1/plugins/${plugin.id}/download?version=${encodeURIComponent(version.version)}`,
    sha256: version.sha256,
    size: version.size,
    publishedAt: version.publishedAt,
  }
}

/**
 * 由库内当前 published 状态生成索引数据。
 * 数据不合法时抛 IndexValidationError，problems 逐条指出插件与原因。
 */
export function buildIndexData(ctx, { publishedAt }) {
  const categories = repo.listCategories(ctx.db, { visibleOnly: true })
  const categoriesById = new Map(categories.map((category) => [category.id, category]))
  const problems = []
  const items = []

  for (const plugin of repo.listPublishedPlugins(ctx.db)) {
    const version = plugin.latestVersion ? repo.getVersion(ctx.db, plugin.id, plugin.latestVersion) : null
    if (!version) {
      problems.push({
        pluginId: plugin.id,
        reason: 'missing-version',
        message: '已上架但 latest_version 没有对应版本记录',
      })
      continue
    }
    if (version.revokedAt) {
      problems.push({ pluginId: plugin.id, reason: 'revoked-version', message: `最新版本 ${version.version} 已吊销` })
      continue
    }
    if (!version.sha256 || !version.zipPath || version.size <= 0) {
      problems.push({
        pluginId: plugin.id,
        reason: 'invalid-artifact',
        message: '版本缺少 sha256 / zip_path / size',
      })
      continue
    }

    const assignment = repo.listPluginCategories(ctx.db, plugin.id)
    const primaries = assignment.filter((item) => item.isPrimary)
    if (primaries.length !== 1) {
      problems.push({
        pluginId: plugin.id,
        reason: 'primary-category',
        message: `已上架插件必须恰好一个主分类，当前 ${primaries.length} 个`,
        categories: assignment.map((item) => item.categoryId),
      })
      continue
    }

    const hidden = assignment.filter((item) => !categoriesById.has(item.categoryId))
    if (hidden.length) {
      problems.push({
        pluginId: plugin.id,
        reason: 'category-not-visible',
        message: '引用了不存在或已隐藏的分类',
        categories: hidden.map((item) => item.categoryId),
      })
      continue
    }

    const primary = primaries[0]
    const primaryCategory = categoriesById.get(primary.categoryId)
    items.push({
      plugin,
      version,
      assignment,
      primary,
      primarySort: primaryCategory?.sort ?? Number.MAX_SAFE_INTEGER,
      primaryAssignmentSort: primary.assignmentSort,
    })
  }

  if (problems.length) throw new IndexValidationError(problems)

  items.sort(
    (a, b) =>
      a.primarySort - b.primarySort ||
      a.primaryAssignmentSort - b.primaryAssignmentSort ||
      a.plugin.name.localeCompare(b.plugin.name, 'zh-Hans-CN') ||
      a.plugin.id.localeCompare(b.plugin.id),
  )

  return {
    version: INDEX_FORMAT_VERSION,
    market: ctx.config.marketName,
    publishedAt,
    categories: categories.map(categoryEntry),
    plugins: items.map((item) =>
      pluginEntry(item.plugin, item.version, item.assignment, item.primary, categoriesById, ctx),
    ),
  }
}

/** 生成未签名候选：snapshotVersion 由服务端按 active + 1 给出 */
export function buildIndexCandidate(ctx) {
  const active = repo.getActiveSnapshotRow(ctx.db)
  const snapshotVersion = (active?.version ?? 0) + 1
  const publishedAt = new Date().toISOString()
  const index = buildIndexData(ctx, { publishedAt })
  const raw = Buffer.from(`${JSON.stringify(index, null, 2)}\n`, 'utf8')
  return {
    snapshotVersion,
    publishedAt,
    index,
    raw,
    contentHash: repo.sha256Hex(raw),
    pluginCount: index.plugins.length,
    categoryCount: index.categories.length,
  }
}

function mismatchDetail(expected, parsed) {
  const expectedPlugins = new Map((expected.index.plugins ?? []).map((item) => [item.id, item]))
  const parsedPlugins = new Map((parsed.plugins ?? []).map((item) => [item.id, item]))
  const missing = [...expectedPlugins.keys()].filter((id) => !parsedPlugins.has(id))
  const extra = [...parsedPlugins.keys()].filter((id) => !expectedPlugins.has(id))
  const changed = [...parsedPlugins.keys()].filter(
    (id) => expectedPlugins.has(id) && !isDeepStrictEqual(expectedPlugins.get(id), parsedPlugins.get(id)),
  )
  return {
    categoriesMatch: isDeepStrictEqual(expected.index.categories, parsed.categories),
    missing,
    extra,
    changed,
  }
}

/**
 * 激活签名快照。
 * @param {{raw: string, signature: string, keyId: string, version?: number, publishedAt?: string}} input
 */
export function activateSnapshot(ctx, input) {
  const raw = typeof input?.raw === 'string' ? input.raw : ''
  const signature = typeof input?.signature === 'string' ? input.signature : ''
  const keyId = typeof input?.keyId === 'string' ? input.keyId : ''

  if (!raw.trim()) throw new HttpError(400, 'raw 不能为空（必须是候选索引的原始 JSON 文本）')
  if (Buffer.byteLength(raw, 'utf8') > MAX_SNAPSHOT_BYTES) throw new HttpError(413, '索引快照过大')
  if (!signature) throw new HttpError(400, 'signature 不能为空')
  if (!keyId) throw new HttpError(400, 'keyId 不能为空')

  if (ctx.config.publicKeys.size === 0) {
    throw new HttpError(503, '未配置 MARKET_PUBLIC_KEYS，服务端无法自检签名')
  }
  const publicKey = ctx.config.publicKeys.get(keyId)
  if (!publicKey) throw new HttpError(400, `未知 keyId：${keyId}`)

  const rawBytes = Buffer.from(raw, 'utf8')
  if (!verifyDetachedSignature(rawBytes, signature, publicKey)) {
    throw new HttpError(400, '签名校验失败：raw 与 signature 不匹配')
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new HttpError(400, `raw 不是合法 JSON：${error.message}`)
  }

  if (parsed?.version !== INDEX_FORMAT_VERSION) {
    throw new HttpError(400, `索引格式版本必须是 ${INDEX_FORMAT_VERSION}，实际为 ${parsed?.version}`)
  }
  if (parsed.market !== ctx.config.marketName) {
    throw new HttpError(400, `索引 market 必须是 ${ctx.config.marketName}`)
  }
  if (!Array.isArray(parsed.categories) || !Array.isArray(parsed.plugins)) {
    throw new HttpError(400, '索引必须包含 categories[] 与 plugins[]')
  }
  if (typeof parsed.publishedAt !== 'string' || Number.isNaN(Date.parse(parsed.publishedAt))) {
    throw new HttpError(400, '索引 publishedAt 不是合法时间')
  }
  if (input.publishedAt && input.publishedAt !== parsed.publishedAt) {
    throw new HttpError(400, '请求的 publishedAt 与签名内容不一致')
  }

  const active = repo.getActiveSnapshotRow(ctx.db)
  const snapshotVersion =
    input.version === undefined || input.version === null ? (active?.version ?? 0) + 1 : Number(input.version)
  if (!Number.isInteger(snapshotVersion) || snapshotVersion <= 0) {
    throw new HttpError(400, 'version 必须是正整数（快照版本，不是索引格式版本）')
  }
  if (active && snapshotVersion <= active.version) {
    throw new HttpError(409, `快照版本必须大于当前激活版本 ${active.version}`)
  }
  if (active && Date.parse(parsed.publishedAt) < Date.parse(active.publishedAt)) {
    throw new HttpError(409, `publishedAt 不得早于当前激活快照 ${active.publishedAt}`)
  }
  if (repo.getSnapshotByVersion(ctx.db, snapshotVersion)) {
    throw new HttpError(409, `快照版本 ${snapshotVersion} 已存在`)
  }

  // 签名只证明「这是发布端签的」；还必须与库内当前数据一致，防止签了过期/错误内容
  let expected
  try {
    expected = buildIndexCandidate(ctx)
  } catch (error) {
    if (error instanceof IndexValidationError) {
      throw new HttpError(422, error.message, { detail: { problems: error.problems } })
    }
    throw error
  }

  if (!isDeepStrictEqual(parsed.categories, expected.index.categories) || !isDeepStrictEqual(parsed.plugins, expected.index.plugins)) {
    throw new HttpError(409, '签名内容与库内当前数据不一致：请重新生成候选并签名', {
      detail: { reason: 'snapshot-db-mismatch', ...mismatchDetail(expected, parsed) },
    })
  }

  const contentHash = repo.sha256Hex(rawBytes)
  const dataVersion = repo.getDataVersion(ctx.db)
  const createdAt = new Date().toISOString()

  const id = repo.transaction(ctx.db, () => {
    repo.supersedeActiveSnapshots(ctx.db)
    const snapshotId = repo.insertSnapshot(ctx.db, {
      version: snapshotVersion,
      publishedAt: parsed.publishedAt,
      raw: rawBytes,
      signature,
      keyId,
      status: 'active',
      contentHash,
      dataVersion,
      pluginCount: parsed.plugins.length,
      createdAt,
    })
    repo.insertAudit(ctx.db, {
      actor: 'admin',
      action: 'index.activate',
      target: String(snapshotVersion),
      detail: {
        keyId,
        contentHash,
        pluginCount: parsed.plugins.length,
        categoryCount: parsed.categories.length,
        dataVersion,
      },
      createdAt,
    })
    return snapshotId
  })

  invalidateSnapshotCache(ctx)
  ctx.logger?.info('index.activated', { id, version: snapshotVersion, pluginCount: parsed.plugins.length })

  return {
    id,
    version: snapshotVersion,
    publishedAt: parsed.publishedAt,
    keyId,
    contentHash,
    pluginCount: parsed.plugins.length,
    categoryCount: parsed.categories.length,
    dataVersion,
    etag: etagFor(rawBytes),
  }
}
