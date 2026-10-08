import type { DocumentParser, ParseContext, ParseResult } from './parser.types'
import { invoiceParser } from './invoice.parser'
import { payrollParser } from './payroll.parser'
import { bankStatementParser } from './bank-statement.parser'
import { idCardParser } from './id-card.parser'
import { businessLicenseParser } from './business-license.parser'
import { trainTicketParser } from './train-ticket.parser'
import { genericReceiptParser } from './generic-receipt.parser'

/** 解析器注册表：按 match 分选最高者 */
export const PARSERS: DocumentParser[] = [
  invoiceParser,
  payrollParser,
  bankStatementParser,
  idCardParser,
  businessLicenseParser,
  trainTicketParser,
  genericReceiptParser,
]

export function parseDocument(ctx: ParseContext): ParseResult {
  let best: DocumentParser | null = null
  let bestScore = -Infinity
  for (const p of PARSERS) {
    const s = p.match(ctx)
    if (s > bestScore) {
      bestScore = s
      best = p
    }
  }

  const avgLineScore =
    ctx.lines.length > 0
      ? ctx.lines.reduce((acc, l) => acc + (l.score || 1), 0) / ctx.lines.length
      : ctx.source === 'pdf'
        ? 1
        : 0.5

  if (!best || bestScore <= 0) {
    return {
      type: 'unknown',
      typeName: '未识别票据类型',
      matchScore: 0,
      fields: [],
      confidence: Math.round(avgLineScore * 1000) / 1000,
    }
  }

  const fields = best.parse(ctx)
  const confidence =
    fields.length > 0
      ? fields.reduce((acc, f) => acc + f.confidence, 0) / fields.length
      : avgLineScore

  return {
    type: best.type,
    typeName: best.typeName,
    matchScore: bestScore,
    fields,
    confidence: Math.round(confidence * 1000) / 1000,
  }
}
