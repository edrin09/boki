import type { OcrBox } from '../engine/ocr.types'
import type { ReceiptType } from '@core/common/enums'

export interface ParsedField {
  /** 英文键名（前端表单映射用） */
  key: string
  /** 中文标签 */
  label: string
  value: string | number | null
  /** 字段置信度 0-1 */
  confidence: number
}

export interface ParseContext {
  /** 文本行（OCR 行或 PDF 文本层行），含坐标 */
  lines: OcrBox[]
  rawText: string
  width: number
  height: number
  /** 文本来源：OCR 识别 or PDF 文本层 */
  source: 'ocr' | 'pdf'
}

export interface ParseResult {
  type: ReceiptType | string
  typeName: string
  /** 类型判定命中分，供解释/调试 */
  matchScore: number
  fields: ParsedField[]
  confidence: number
}

export interface DocumentParser {
  type: ReceiptType | string
  typeName: string
  /** 类型命中分（可为负排除项），由注册表取最高者 */
  match(ctx: ParseContext): number
  parse(ctx: ParseContext): ParsedField[]
}
