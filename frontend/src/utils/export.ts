import * as XLSX from 'xlsx'
import { formatAmount } from './format'

/** 通用列定义 */
export interface ExcelColumn<T = any> {
  /** 列标题 */
  title: string
  /** 取值字段（支持 a.b.c） */
  prop: string
  /** 列宽，默认 14 */
  width?: number
  /** 是否为金额列（自动千分位） */
  amount?: boolean
  /** 自定义格式化 */
  format?: (row: T, index: number) => string | number
}

/** 导出为 Excel 文件 */
export function exportExcel<T = any>(options: {
  filename: string
  sheetName?: string
  columns: ExcelColumn<T>[]
  rows: T[]
  /** 汇总行数据（追加在末尾） */
  summary?: Record<string, any>
  /** 表头合并单元格，如 [['科目编码','科目名称']] */
  title?: string
  subtitle?: string
}): void {
  const { filename, sheetName = 'Sheet1', columns, rows, summary, title, subtitle } = options

  const aoa: any[][] = []

  if (title) aoa.push([title])
  if (subtitle) aoa.push([subtitle])
  if (title || subtitle) aoa.push([])

  aoa.push(columns.map((c) => c.title))

  rows.forEach((row, index) => {
    aoa.push(
      columns.map((col) => {
        if (col.format) return col.format(row, index)
        const raw = getByPath(row, col.prop)
        if (col.amount) return Number(raw ?? 0)
        return raw ?? ''
      }),
    )
  })

  if (summary) {
    aoa.push([])
    aoa.push(
      columns.map((col) => {
        if (col.prop === '__label') return '合计'
        const v = summary[col.prop]
        if (v === undefined) return ''
        return v
      }),
    )
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // 列宽
  ws['!cols'] = columns.map((c) => ({ wch: c.width ?? 14 }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}

/** 导出「表格 + 合计行」便捷方法 */
export function exportWithSummary<T = any>(
  filename: string,
  sheetName: string,
  columns: ExcelColumn<T>[],
  rows: T[],
  summary: Record<string, any>,
  subtitle?: string,
): void {
  exportExcel({ filename, sheetName, columns, rows, summary, subtitle })
}

/** 金额列格式化函数 */
export function amountFormatter(): (row: any) => string {
  return (row) => formatAmount(row)
}

function getByPath(obj: any, path: string): any {
  if (!obj || !path) return undefined
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj)
}