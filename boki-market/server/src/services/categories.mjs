/**
 * 分类管理：CRUD、主分类唯一、删除保护、插件归属
 *
 * 分类只影响展示与筛选；不参与插件安装、加载、依赖与权限判断。
 * 上架校验与索引候选校验会强制：
 *   - 每个 published 插件恰好一个主分类；
 *   - 引用的分类必须存在且 status='visible'。
 */
import { HttpError } from '../lib/http.mjs'
import * as repo from '../db/repository.mjs'

const CATEGORY_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
const STATUS = new Set(['visible', 'hidden'])

function text(value, { field, max, required = false }) {
  if (value === undefined || value === null) {
    if (required) throw new HttpError(400, `${field} 不能为空`)
    return null
  }
  if (typeof value !== 'string') throw new HttpError(400, `${field} 必须是字符串`)
  const trimmed = value.trim()
  if (required && !trimmed) throw new HttpError(400, `${field} 不能为空`)
  if (trimmed.length > max) throw new HttpError(400, `${field} 最长 ${max} 个字符`)
  return trimmed || null
}

function sortValue(value, fallback = 0) {
  if (value === undefined || value === null) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < -1_000_000 || parsed > 1_000_000) {
    throw new HttpError(400, 'sort 必须是 -1000000..1000000 的整数')
  }
  return parsed
}

function statusValue(value, fallback = 'visible') {
  if (value === undefined || value === null) return fallback
  if (!STATUS.has(value)) throw new HttpError(400, 'status 必须是 visible 或 hidden')
  return value
}

function assertParent(ctx, parentId, selfId = null) {
  if (parentId === null || parentId === undefined || parentId === '') return null
  const id = String(parentId)
  if (selfId && id === selfId) throw new HttpError(400, '分类不能以自身为父级')
  if (!repo.getCategory(ctx.db, id)) throw new HttpError(400, `父级分类不存在：${id}`)

  // 防止多级分类形成环
  let cursor = repo.getCategory(ctx.db, id)
  const seen = new Set()
  while (cursor?.parentId) {
    if (cursor.parentId === selfId) throw new HttpError(400, '分类层级不能形成环')
    if (seen.has(cursor.id)) throw new HttpError(400, '分类层级已存在环，请先修复')
    seen.add(cursor.id)
    cursor = repo.getCategory(ctx.db, cursor.parentId)
  }
  return id
}

export function listCategories(ctx) {
  const categories = repo.listCategories(ctx.db)
  return {
    categories,
    total: categories.length,
    uncategorized: repo.countUncategorizedPlugins(ctx.db),
  }
}

export function createCategory(ctx, input) {
  const id = text(input?.id, { field: 'id', max: 64, required: true })
  if (!CATEGORY_ID_RE.test(id)) {
    throw new HttpError(400, 'id 必须是 1..64 位小写字母、数字或连字符，且以字母/数字开头')
  }
  if (repo.getCategory(ctx.db, id)) throw new HttpError(409, `分类已存在：${id}`)

  const name = text(input?.name, { field: 'name', max: 80, required: true })
  const parentId = assertParent(ctx, input?.parentId)
  const category = {
    id,
    name,
    parentId,
    sort: sortValue(input?.sort, 0),
    icon: text(input?.icon, { field: 'icon', max: 64 }),
    description: text(input?.description, { field: 'description', max: 500 }),
    status: statusValue(input?.status),
    isSystem: false,
  }
  const now = new Date().toISOString()

  repo.transaction(ctx.db, () => {
    repo.insertCategory(ctx.db, category, now)
    repo.bumpDataVersion(ctx.db, now)
    repo.insertAudit(ctx.db, {
      actor: 'admin',
      action: 'category.create',
      target: id,
      detail: { name, parentId, sort: category.sort },
      createdAt: now,
    })
  })
  return repo.getCategory(ctx.db, id)
}

export function updateCategory(ctx, id, patch) {
  const existing = repo.getCategory(ctx.db, id)
  if (!existing) throw new HttpError(404, `分类不存在：${id}`)

  const name =
    patch?.name === undefined ? existing.name : text(patch.name, { field: 'name', max: 80, required: true })
  const icon = patch?.icon === undefined ? existing.icon : text(patch.icon, { field: 'icon', max: 64 })
  const description =
    patch?.description === undefined
      ? existing.description
      : text(patch.description, { field: 'description', max: 500 })
  const status = patch?.status === undefined ? existing.status : statusValue(patch.status)
  const sort = patch?.sort === undefined ? existing.sort : sortValue(patch.sort, existing.sort)

  let parentId = existing.parentId
  if (patch?.parentId !== undefined) {
    parentId = assertParent(ctx, patch.parentId, id)
    if (existing.isSystem && parentId !== existing.parentId) {
      throw new HttpError(403, '内置分类不能调整父级（只允许改名、排序、图标、描述与可见性）')
    }
  }

  const now = new Date().toISOString()
  repo.transaction(ctx.db, () => {
    repo.updateCategoryRow(
      ctx.db,
      id,
      { name, parentId, sort, icon, description, status },
      now,
    )
    repo.bumpDataVersion(ctx.db, now)
    repo.insertAudit(ctx.db, {
      actor: 'admin',
      action: 'category.update',
      target: id,
      detail: { name, parentId, sort, status },
      createdAt: now,
    })
  })
  return repo.getCategory(ctx.db, id)
}

export function deleteCategory(ctx, id) {
  const existing = repo.getCategory(ctx.db, id)
  if (!existing) throw new HttpError(404, `分类不存在：${id}`)
  if (existing.isSystem) throw new HttpError(403, '内置分类不可删除（可改名、排序或隐藏）')

  const references = repo.countCategoryReferences(ctx.db, id)
  if (references > 0) {
    throw new HttpError(409, `分类仍被 ${references} 个插件引用，不能删除；请先迁移归属`, {
      detail: { references },
    })
  }

  const now = new Date().toISOString()
  repo.transaction(ctx.db, () => {
    repo.deleteCategoryRow(ctx.db, id)
    repo.bumpDataVersion(ctx.db, now)
    repo.insertAudit(ctx.db, {
      actor: 'admin',
      action: 'category.delete',
      target: id,
      detail: { name: existing.name },
      createdAt: now,
    })
  })
  return { deleted: true, id }
}

export function setPluginCategories(ctx, pluginId, input) {
  const plugin = repo.getPlugin(ctx.db, pluginId)
  if (!plugin) throw new HttpError(404, `插件不存在：${pluginId}`)

  const raw = input?.categories
  if (!Array.isArray(raw)) throw new HttpError(400, 'categories 必须是数组')
  if (raw.length > 20) throw new HttpError(400, '一个插件最多 20 个分类')

  const categories = []
  for (const value of raw) {
    const id = text(value, { field: 'categories[]', max: 64, required: true })
    if (!CATEGORY_ID_RE.test(id)) throw new HttpError(400, `分类 id 不合法：${id}`)
    if (!categories.includes(id)) categories.push(id)
  }
  for (const id of categories) {
    if (!repo.getCategory(ctx.db, id)) throw new HttpError(400, `分类不存在：${id}`)
  }

  let primary = input?.primary ?? null
  if (primary !== null) {
    primary = String(primary)
    if (!categories.includes(primary)) throw new HttpError(400, 'primary 必须包含在 categories 中')
  }
  if (categories.length > 0 && !primary) throw new HttpError(400, '设置分类时必须指定 primary 主分类')

  const now = new Date().toISOString()
  repo.transaction(ctx.db, () => {
    repo.replacePluginCategories(ctx.db, pluginId, { primary, categories }, now)
    repo.bumpDataVersion(ctx.db, now)
    repo.insertAudit(ctx.db, {
      actor: 'admin',
      action: 'plugin.categories',
      target: pluginId,
      detail: { primary, categories },
      createdAt: now,
    })
  })

  return {
    pluginId,
    primary,
    categories: repo.listPluginCategories(ctx.db, pluginId),
  }
}

/** 上架前校验：恰好一个主分类 + 所有分类可见 */
export function assertPublishableCategories(ctx, pluginId) {
  const assignments = repo.listPluginCategories(ctx.db, pluginId)
  const primaries = assignments.filter((item) => item.isPrimary)
  if (primaries.length !== 1) {
    throw new HttpError(409, '上架前必须为插件指定恰好一个主分类', {
      detail: { pluginId, primaryCategories: primaries.length },
    })
  }
  const hidden = assignments.filter((item) => item.status !== 'visible')
  if (hidden.length) {
    throw new HttpError(409, '插件引用了已隐藏的分类，请先调整归属或恢复分类可见性', {
      detail: { pluginId, hidden: hidden.map((item) => item.categoryId) },
    })
  }
  return { primary: primaries[0].categoryId, assignments }
}
