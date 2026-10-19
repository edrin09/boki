import * as XLSX from 'xlsx'

/**
 * Excel/CSV 导入通用解析工具（员工花名册、借款单、报销单等结构化表格共用）。
 * 单元格保留原始类型（string/number/Date），由 cellText / toNum / excelDateToStr 按需转换。
 */
export type SheetGrid = unknown[][]

/** 读取首个工作表为二维网格（CSV 自动识别 GBK/UTF-8） */
export function readSheetGrid(buffer: Buffer, originalName: string): SheetGrid {
  if (/\.csv$/i.test(originalName) || /^text\/csv/.test(originalName)) {
    return parseCsvGrid(buffer)
  }
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return []
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }) as SheetGrid
}

function parseCsvGrid(buffer: Buffer): SheetGrid {
  return decodeCsv(buffer)
    .split(/\r?\n/)
    .map((line) =>
      line
        .split(/[,，\t]/)
        .map((cell) => cell.trim().replace(/^["']|["']$/g, '')),
    )
}

function decodeCsv(buffer: Buffer): string {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  if ((utf8.match(/\uFFFD/g) ?? []).length === 0) return utf8
  try {
    return new TextDecoder('gbk').decode(buffer)
  } catch {
    return utf8
  }
}

/** 单元格转文本（数字去掉浮点尾差，身份证/手机号等长数字直接拼接） */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return excelDateToStr(v)
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  return String(v).trim()
}

/** 单元格转数字（容忍千分位/货币符号） */
export function toNum(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (v instanceof Date) return 0
  if (v === null || v === undefined) return 0
  const s = String(v).replace(/[,，￥¥\s]/g, '').trim()
  if (!s) return 0
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

/**
 * 日期单元格 → YYYY-MM-DD。
 * 兼容：Date 对象（cellDates）/ Excel 序列号（如 46294）/ 常见文本日期。
 */
export function excelDateToStr(v: unknown): string {
  if (v === null || v === undefined || v === '') return ''
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return ''
    return formatDate(new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())))
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v < 1000 || v > 90000) return ''
    // Excel 序列号：1899-12-30 为第 0 天，25569 天后为 1970-01-01
    return formatDate(new Date(Math.round((v - 25569) * 86400000)))
  }
  const s = String(v).trim()
  if (!s) return ''
  // 20260910
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`
  // 2026/9/10、2026-9-10、2026.9.10
  const parts = s.match(/^(\d{4})[./\-年](\d{1,2})[./\-月](\d{1,2})日?$/)
  if (parts) {
    const y = Number(parts[1])
    const m = Number(parts[2])
    const d = Number(parts[3])
    if (y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${parts[1]}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  }
  const parsed = new Date(s)
  if (!Number.isNaN(parsed.getTime())) return formatDate(parsed)
  return ''
}

function formatDate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export interface ColumnRule {
  key: string
  keywords: string[]
}

/**
 * 定位表头行：首行需命中 mustHave 关键词，且至少命中 anyKeyword 个其他列关键词。
 * 返回 -1 表示未找到。
 */
export function findHeaderRow(
  grid: SheetGrid,
  mustHave: string[],
  anyOf: string[],
  scanLines = 10,
): number {
  const hit = (line: unknown[], keywords: string[]) =>
    keywords.some((k) => line.some((cell) => cellText(cell).includes(k)))
  for (let i = 0; i < Math.min(grid.length, scanLines); i++) {
    const line = grid[i] ?? []
    if (!hit(line, mustHave)) continue
    if (anyOf.length === 0 || hit(line, anyOf)) return i
  }
  return -1
}

/** 表头 → 列号映射（按规则顺序优先匹配，列不重复使用） */
export function mapColumns(
  header: unknown[],
  rules: ColumnRule[],
): Record<string, number> {
  const map: Record<string, number> = {}
  const used = new Set<number>()
  for (const rule of rules) {
    for (let i = 0; i < header.length; i++) {
      if (used.has(i)) continue
      const text = cellText(header[i])
      if (text && rule.keywords.some((k) => text.includes(k))) {
        map[rule.key] = i
        used.add(i)
        break
      }
    }
  }
  return map
}

/** 是否为合计/小计等汇总行 */
export function isSummaryRow(text: string): boolean {
  return /^(合计|小计|总计|汇总|共计)/.test(text)
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
