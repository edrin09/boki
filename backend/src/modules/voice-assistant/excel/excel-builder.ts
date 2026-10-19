import * as XLSX from 'xlsx'
import type { IntentColumn } from '../nlu/intent-registry'

/**
 * 生成 xlsx 工作簿。
 *
 * 语音指令返回的 card 与 Excel 共用同一套列定义（IntentColumn），
 * 保证「听到的总结」与「下载的明细」数字来源一致。
 */
export function buildWorkbook(
  title: string,
  columns: IntentColumn[],
  rows: Array<Record<string, unknown>>,
  footerTotals?: Record<string, unknown> | null,
): Buffer {
  const sheetName = sanitizeSheetName(title)

  const header = columns.map((c) => c.label)
  const body = rows.map((row) =>
    columns.map((c) => {
      const v = row[c.key]
      if (v == null) return ''
      if (c.numeric && typeof v === 'number') return v
      return typeof v === 'number' ? v : String(v)
    }),
  )
  const footer = footerTotals ? columns.map((c) => footerTotals[c.key] ?? '') : null

  const aoa: unknown[][] = [[sheetName], header, ...body]
  if (footer) aoa.push(footer)

  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // 列宽：按内容自适应，限制在 8~40
  ws['!cols'] = columns.map((c, i) => {
    let width = c.label.length * 2 + 2
    if (c.width) width = Math.max(width, c.width)
    for (const r of rows) {
      const text = String(r[c.key] ?? '')
      width = Math.max(width, Math.min(40, text.length * 2 + 2))
    }
    void i
    return { wch: Math.max(8, width) }
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

/** 工作表名限制 31 字符，且不能含 : \ / ? * [ ] */
function sanitizeSheetName(title: string): string {
  const clean = title.replace(/[:\\/?*[\]]/g, '-').trim()
  return clean.slice(0, 31) || '导出'
}
