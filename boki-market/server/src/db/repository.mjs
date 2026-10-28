/**
 * 数据访问层（Repository）
 *
 * 规则：
 *   - 所有 SQL 集中在本文件，services/ 不直接写 SQL；
 *   - 事务一律走 transaction()，只支持同步回调（node:sqlite 是同步 API）；
 *   - 行对象在这里完成 snake_case → camelCase 映射，并集中解析 JSON 字段。
 */
import crypto from 'node:crypto'

const PLUGIN_COLUMNS = `
  id, name, description, trust, license, price, currency, license_url,
  status, latest_version, created_at, updated_at
`

const VERSION_COLUMNS = `
  id, plugin_id, version, api_version, engines_json, sha256, size, zip_path,
  signature, published_at, revoked_at, download_count
`

const CATEGORY_COLUMNS = `
  id, name, parent_id, sort_order, icon, description, status, is_system,
  created_at, updated_at
`

const SNAPSHOT_COLUMNS = `
  id, version, published_at, raw, signature, key_id, status,
  content_hash, data_version, plugin_count, created_at
`

const LICENSE_COLUMNS = `
  id, key_hash, plugin_id, plan, status, order_id, buyer_ref,
  issued_at, expires_at, revoked_at
`

const ORDER_COLUMNS = `
  id, plugin_id, license_id, amount, currency, status, provider,
  provider_ref, buyer_ref, created_at, paid_at
`

export function nowIso() {
  return new Date().toISOString()
}

/** 同步事务：失败整体回滚；不支持嵌套（服务层自行避免） */
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      /* 事务已结束 */
    }
    throw error
  }
}

// ---------------------------------------------------------------- meta

export function getMeta(db, key) {
  return db.prepare('SELECT value FROM market_meta WHERE key = ?').get(key)?.value ?? null
}

export function setMeta(db, key, value, now = nowIso()) {
  db.prepare(`
    INSERT INTO market_meta (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, String(value), now)
}

export function getDataVersion(db) {
  return Number(getMeta(db, 'data_version') ?? 0)
}

/** 任何影响索引内容的写操作都要调用；返回新版本号 */
export function bumpDataVersion(db, now = nowIso()) {
  const next = getDataVersion(db) + 1
  setMeta(db, 'data_version', String(next), now)
  return next
}

// ------------------------------------------------------------- plugins

function mapPlugin(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    trust: row.trust,
    license: row.license,
    price: Number(row.price),
    currency: row.currency,
    licenseUrl: row.license_url,
    status: row.status,
    latestVersion: row.latest_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function getPlugin(db, id) {
  return mapPlugin(db.prepare(`SELECT ${PLUGIN_COLUMNS} FROM plugins WHERE id = ?`).get(id))
}

export function listPlugins(db, { status } = {}) {
  const rows = status
    ? db.prepare(`SELECT ${PLUGIN_COLUMNS} FROM plugins WHERE status = ? ORDER BY name, id`).all(status)
    : db.prepare(`SELECT ${PLUGIN_COLUMNS} FROM plugins ORDER BY name, id`).all()
  return rows.map(mapPlugin)
}

export function listPublishedPlugins(db) {
  return db
    .prepare(`SELECT ${PLUGIN_COLUMNS} FROM plugins WHERE status = 'published' ORDER BY name, id`)
    .all()
    .map(mapPlugin)
}

export function countPluginsByStatus(db) {
  const result = {}
  for (const row of db.prepare('SELECT status, COUNT(*) AS n FROM plugins GROUP BY status').all()) {
    result[row.status] = Number(row.n)
  }
  return result
}

/** 新建或整体更新；调用方负责合并未提供的字段 */
export function savePlugin(db, plugin, now = nowIso()) {
  const existing = db.prepare('SELECT id FROM plugins WHERE id = ?').get(plugin.id)
  if (existing) {
    db.prepare(`
      UPDATE plugins SET
        name = ?, description = ?, trust = ?, license = ?, price = ?, currency = ?,
        license_url = ?, status = ?, latest_version = ?, updated_at = ?
      WHERE id = ?
    `).run(
      plugin.name,
      plugin.description ?? null,
      plugin.trust,
      plugin.license ?? null,
      plugin.price,
      plugin.currency,
      plugin.licenseUrl ?? null,
      plugin.status,
      plugin.latestVersion ?? null,
      now,
      plugin.id,
    )
  } else {
    db.prepare(`
      INSERT INTO plugins (
        id, name, description, trust, license, price, currency, license_url,
        status, latest_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      plugin.id,
      plugin.name,
      plugin.description ?? null,
      plugin.trust,
      plugin.license ?? null,
      plugin.price,
      plugin.currency,
      plugin.licenseUrl ?? null,
      plugin.status,
      plugin.latestVersion ?? null,
      now,
      now,
    )
  }
  return getPlugin(db, plugin.id)
}

export function setPluginStatus(db, id, status, now = nowIso()) {
  const result = db.prepare('UPDATE plugins SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id)
  return result.changes > 0
}

export function setLatestVersion(db, id, version, now = nowIso()) {
  db.prepare('UPDATE plugins SET latest_version = ?, updated_at = ? WHERE id = ?').run(version, now, id)
}

// ------------------------------------------------------------ versions

function mapVersion(row) {
  if (!row) return null
  return {
    id: row.id,
    pluginId: row.plugin_id,
    version: row.version,
    apiVersion: row.api_version,
    engines: row.engines_json ? safeJsonParse(row.engines_json) : null,
    enginesJson: row.engines_json,
    sha256: row.sha256,
    size: Number(row.size),
    zipPath: row.zip_path,
    signature: row.signature,
    publishedAt: row.published_at,
    revokedAt: row.revoked_at,
    downloadCount: Number(row.download_count),
  }
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function getVersion(db, pluginId, version) {
  return mapVersion(
    db
      .prepare(`SELECT ${VERSION_COLUMNS} FROM plugin_versions WHERE plugin_id = ? AND version = ?`)
      .get(pluginId, version),
  )
}

export function listVersions(db, pluginId) {
  return db
    .prepare(
      `SELECT ${VERSION_COLUMNS} FROM plugin_versions WHERE plugin_id = ? ORDER BY published_at DESC, id DESC`,
    )
    .all(pluginId)
    .map(mapVersion)
}

export function insertVersion(db, version) {
  const result = db.prepare(`
    INSERT INTO plugin_versions (
      plugin_id, version, api_version, engines_json, sha256, size, zip_path,
      signature, published_at, revoked_at, download_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)
  `).run(
    version.pluginId,
    version.version,
    version.apiVersion,
    version.engines ? JSON.stringify(version.engines) : null,
    version.sha256,
    version.size,
    version.zipPath,
    version.signature ?? null,
    version.publishedAt,
  )
  return Number(result.lastInsertRowid)
}

export function revokeVersionRow(db, pluginId, version, revokedAt = nowIso()) {
  return (
    db
      .prepare('UPDATE plugin_versions SET revoked_at = ? WHERE plugin_id = ? AND version = ?')
      .run(revokedAt, pluginId, version).changes > 0
  )
}

export function incrementVersionDownloads(db, pluginId, version, count = 1) {
  db.prepare(
    'UPDATE plugin_versions SET download_count = download_count + ? WHERE plugin_id = ? AND version = ?',
  ).run(count, pluginId, version)
}

export function versionTotals(db) {
  const row = db
    .prepare('SELECT COUNT(*) AS total, COALESCE(SUM(download_count), 0) AS downloads FROM plugin_versions')
    .get()
  return { total: Number(row.total), downloads: Number(row.downloads) }
}

// ---------------------------------------------------------- categories

function mapCategory(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    sort: Number(row.sort_order),
    sortOrder: Number(row.sort_order),
    icon: row.icon,
    description: row.description,
    status: row.status,
    isSystem: Number(row.is_system) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.plugin_count === undefined ? {} : { pluginCount: Number(row.plugin_count) }),
    ...(row.primary_count === undefined ? {} : { primaryCount: Number(row.primary_count) }),
  }
}

export function getCategory(db, id) {
  return mapCategory(db.prepare(`SELECT ${CATEGORY_COLUMNS} FROM categories WHERE id = ?`).get(id))
}

/**
 * 分类列表：一级在前，同父级按 sort_order，再按 id。
 * pluginCount 统计所有归属（含副分类），primaryCount 只统计主分类。
 */
export function listCategories(db, { visibleOnly = false } = {}) {
  const where = visibleOnly ? "WHERE c.status = 'visible'" : ''
  const rows = db
    .prepare(`
      SELECT c.*,
        (SELECT COUNT(DISTINCT pc.plugin_id) FROM plugin_categories pc WHERE pc.category_id = c.id) AS plugin_count,
        (SELECT COUNT(*) FROM plugin_categories pc WHERE pc.category_id = c.id AND pc.is_primary = 1) AS primary_count
      FROM categories c
      ${where}
      ORDER BY CASE WHEN c.parent_id IS NULL THEN 0 ELSE 1 END,
               COALESCE(c.parent_id, ''), c.sort_order, c.id
    `)
    .all()
  return rows.map(mapCategory)
}

export function insertCategory(db, category, now = nowIso()) {
  db.prepare(`
    INSERT INTO categories (
      id, name, parent_id, sort_order, icon, description, status, is_system, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    category.id,
    category.name,
    category.parentId ?? null,
    category.sort ?? 0,
    category.icon ?? null,
    category.description ?? null,
    category.status ?? 'visible',
    category.isSystem ? 1 : 0,
    now,
    now,
  )
  return getCategory(db, category.id)
}

/** 整体更新；is_system 与 id、created_at 不可改 */
export function updateCategoryRow(db, id, category, now = nowIso()) {
  db.prepare(`
    UPDATE categories SET
      name = ?, parent_id = ?, sort_order = ?, icon = ?, description = ?, status = ?, updated_at = ?
    WHERE id = ?
  `).run(
    category.name,
    category.parentId ?? null,
    category.sort ?? 0,
    category.icon ?? null,
    category.description ?? null,
    category.status ?? 'visible',
    now,
    id,
  )
  return getCategory(db, id)
}

export function deleteCategoryRow(db, id) {
  return db.prepare('DELETE FROM categories WHERE id = ?').run(id).changes > 0
}

export function countCategoryReferences(db, id) {
  return Number(
    db.prepare('SELECT COUNT(*) AS n FROM plugin_categories WHERE category_id = ?').get(id).n,
  )
}

export function countUncategorizedPlugins(db) {
  return Number(
    db
      .prepare(`
        SELECT COUNT(*) AS n FROM plugins p
        WHERE NOT EXISTS (SELECT 1 FROM plugin_categories pc WHERE pc.plugin_id = p.id)
      `)
      .get().n,
  )
}

export function listPluginCategories(db, pluginId) {
  return db
    .prepare(`
      SELECT pc.plugin_id, pc.category_id, pc.is_primary, pc.sort_order AS assignment_sort,
             c.name, c.status, c.sort_order AS category_sort, c.parent_id
      FROM plugin_categories pc
      JOIN categories c ON c.id = pc.category_id
      WHERE pc.plugin_id = ?
      ORDER BY c.sort_order, c.id
    `)
    .all(pluginId)
    .map((row) => ({
      pluginId: row.plugin_id,
      categoryId: row.category_id,
      isPrimary: Number(row.is_primary) === 1,
      assignmentSort: Number(row.assignment_sort),
      name: row.name,
      status: row.status,
      categorySort: Number(row.category_sort),
      parentId: row.parent_id,
    }))
}

/** 覆盖式写入：先删后插，主分类唯一由部分唯一索引兜底 */
export function replacePluginCategories(db, pluginId, { primary, categories }, now = nowIso()) {
  db.prepare('DELETE FROM plugin_categories WHERE plugin_id = ?').run(pluginId)
  const insert = db.prepare(`
    INSERT INTO plugin_categories (plugin_id, category_id, is_primary, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?)
  `)
  categories.forEach((categoryId, index) => {
    insert.run(pluginId, categoryId, categoryId === primary ? 1 : 0, (index + 1) * 10, now)
  })
}

// ----------------------------------------------------------- snapshots

function mapSnapshot(row) {
  if (!row) return null
  return {
    id: row.id,
    version: Number(row.version),
    publishedAt: row.published_at,
    raw: row.raw == null ? null : Buffer.from(row.raw),
    signature: row.signature,
    keyId: row.key_id,
    status: row.status,
    contentHash: row.content_hash,
    dataVersion: Number(row.data_version),
    pluginCount: Number(row.plugin_count),
    createdAt: row.created_at,
  }
}

export function getActiveSnapshotRow(db) {
  return mapSnapshot(
    db.prepare(`SELECT ${SNAPSHOT_COLUMNS} FROM index_snapshots WHERE status = 'active'`).get(),
  )
}

export function getSnapshotByVersion(db, version) {
  return mapSnapshot(
    db.prepare(`SELECT ${SNAPSHOT_COLUMNS} FROM index_snapshots WHERE version = ?`).get(version),
  )
}

export function countSnapshots(db) {
  return Number(db.prepare('SELECT COUNT(*) AS n FROM index_snapshots').get().n)
}

export function supersedeActiveSnapshots(db) {
  return db
    .prepare("UPDATE index_snapshots SET status = 'superseded' WHERE status = 'active'")
    .run().changes
}

export function insertSnapshot(db, snapshot) {
  const result = db.prepare(`
    INSERT INTO index_snapshots (
      version, published_at, raw, signature, key_id, status,
      content_hash, data_version, plugin_count, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    snapshot.version,
    snapshot.publishedAt,
    snapshot.raw,
    snapshot.signature,
    snapshot.keyId,
    snapshot.status ?? 'active',
    snapshot.contentHash ?? null,
    snapshot.dataVersion ?? 0,
    snapshot.pluginCount ?? 0,
    snapshot.createdAt ?? nowIso(),
  )
  return Number(result.lastInsertRowid)
}

// ------------------------------------------------------------ licenses

function mapLicense(row) {
  if (!row) return null
  return {
    id: row.id,
    keyHash: row.key_hash,
    pluginId: row.plugin_id,
    plan: row.plan,
    status: row.status,
    orderId: row.order_id,
    buyerRef: row.buyer_ref,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  }
}

export function insertLicense(db, license, now = nowIso()) {
  db.prepare(`
    INSERT INTO licenses (
      id, key_hash, plugin_id, plan, status, order_id, buyer_ref, issued_at, expires_at, revoked_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    license.id,
    license.keyHash,
    license.pluginId,
    license.plan,
    license.status ?? 'active',
    license.orderId ?? null,
    license.buyerRef ?? null,
    now,
    license.expiresAt ?? null,
    null,
  )
  return getLicenseById(db, license.id)
}

export function getLicenseByHash(db, keyHash) {
  return mapLicense(
    db.prepare(`SELECT ${LICENSE_COLUMNS} FROM licenses WHERE key_hash = ?`).get(keyHash),
  )
}

export function getLicenseById(db, id) {
  return mapLicense(db.prepare(`SELECT ${LICENSE_COLUMNS} FROM licenses WHERE id = ?`).get(id))
}

export function revokeLicenseRow(db, id, revokedAt = nowIso()) {
  return (
    db
      .prepare("UPDATE licenses SET status = 'revoked', revoked_at = ? WHERE id = ? AND status <> 'revoked'")
      .run(revokedAt, id).changes > 0
  )
}

export function listLicenses(db, { pluginId, status, limit = 50, offset = 0 } = {}) {
  const clauses = []
  const params = []
  if (pluginId) {
    clauses.push('plugin_id = ?')
    params.push(pluginId)
  }
  if (status) {
    clauses.push('status = ?')
    params.push(status)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  return db
    .prepare(`SELECT ${LICENSE_COLUMNS} FROM licenses ${where} ORDER BY issued_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset)
    .map(mapLicense)
}

export function countLicensesByStatus(db) {
  const result = {}
  for (const row of db.prepare('SELECT status, COUNT(*) AS n FROM licenses GROUP BY status').all()) {
    result[row.status] = Number(row.n)
  }
  return result
}

// -------------------------------------------------------------- orders

function mapOrder(row) {
  if (!row) return null
  return {
    id: row.id,
    pluginId: row.plugin_id,
    licenseId: row.license_id,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    provider: row.provider,
    providerRef: row.provider_ref,
    buyerRef: row.buyer_ref,
    createdAt: row.created_at,
    paidAt: row.paid_at,
  }
}

export function listOrders(db, { status, limit = 50, offset = 0 } = {}) {
  const where = status ? 'WHERE status = ?' : ''
  const params = status ? [status] : []
  return db
    .prepare(`SELECT ${ORDER_COLUMNS} FROM orders ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset)
    .map(mapOrder)
}

export function orderTotals(db) {
  const rows = db.prepare('SELECT status, COUNT(*) AS n, COALESCE(SUM(amount), 0) AS amount FROM orders GROUP BY status').all()
  const result = { total: 0, paid: 0, revenue: 0, byStatus: {} }
  for (const row of rows) {
    result.byStatus[row.status] = Number(row.n)
    result.total += Number(row.n)
    if (row.status === 'paid') {
      result.paid = Number(row.n)
      result.revenue = Number(row.amount)
    }
  }
  return result
}

// -------------------------------------------------------- download log

export function insertDownloadEvents(db, events) {
  if (!events.length) return 0
  const insert = db.prepare(`
    INSERT INTO download_events (plugin_id, version, license_id, ip_hash, ua, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const increment = db.prepare(`
    UPDATE plugin_versions SET download_count = download_count + 1
    WHERE plugin_id = ? AND version = ?
  `)
  return transaction(db, () => {
    for (const event of events) {
      insert.run(
        event.pluginId,
        event.version || '',
        event.licenseId ?? null,
        event.ipHash ?? null,
        event.ua ?? null,
        event.status,
        event.createdAt ?? nowIso(),
      )
      if (event.status === 200) increment.run(event.pluginId, event.version)
    }
    return events.length
  })
}

export function downloadEventCounts(db) {
  const result = { total: 0, byStatus: {} }
  for (const row of db.prepare('SELECT status, COUNT(*) AS n FROM download_events GROUP BY status').all()) {
    result.byStatus[String(row.status)] = Number(row.n)
    result.total += Number(row.n)
  }
  return result
}

export function downloadsLast24h(db) {
  return Number(
    db
      .prepare("SELECT COUNT(*) AS n FROM download_events WHERE created_at >= datetime('now', '-1 day') AND status = 200")
      .get().n,
  )
}

export function downloadsByPlugin(db, { limit = 20 } = {}) {
  return db
    .prepare(`
      SELECT plugin_id AS pluginId, COUNT(*) AS n
      FROM download_events
      WHERE status = 200
      GROUP BY plugin_id
      ORDER BY n DESC, plugin_id
      LIMIT ?
    `)
    .all(limit)
    .map((row) => ({ pluginId: row.pluginId, count: Number(row.n) }))
}

// ---------------------------------------------------------------- audit

export function insertAudit(db, { actor, action, target, detail, createdAt = nowIso() }) {
  db.prepare('INSERT INTO audit_log (actor, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)').run(
    actor,
    action,
    target ?? null,
    detail === undefined || detail === null ? null : typeof detail === 'string' ? detail : JSON.stringify(detail),
    createdAt,
  )
}

export function listAudit(db, { action, limit = 50, offset = 0 } = {}) {
  const where = action ? 'WHERE action = ?' : ''
  const params = action ? [action] : []
  return db
    .prepare(`SELECT id, actor, action, target, detail, created_at FROM audit_log ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset)
    .map((row) => ({
      id: row.id,
      actor: row.actor,
      action: row.action,
      target: row.target,
      detail: row.detail ? safeJsonParse(row.detail) : null,
      createdAt: row.created_at,
    }))
}

// ------------------------------------------------------------- crypto

export function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}
