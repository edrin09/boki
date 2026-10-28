import type { DocumentParser, ParsedField, ParseContext } from './parser.types'
import {
  cnyUppercaseToNumber,
  extractDate,
  extractMoney,
  field,
  findLine,
  norm,
  valueAfterLabel,
} from './parser.utils'

export const genericReceiptParser: DocumentParser = {
  type: 'receipt',
  typeName: '通用收据',

  match(ctx: ParseContext): number {
    const t = norm(ctx.rawText)
    let score = 0
    if (t.includes('收据')) score += 5
    if (t.includes('收款单位')) score += 3
    if (t.includes('实收')) score += 2
    if (t.includes('今收到') || t.includes('今收')) score += 2
    if (t.includes('摘要')) score += 1
    if (t.includes('发票') || t.includes('身份证') || t.includes('营业执照') || t.includes('火车票')) score -= 12
    return score
  },

  parse(ctx: ParseContext): ParsedField[] {
    const { lines, rawText } = ctx
    const fallback = ctx.source === 'pdf' ? 1 : 0.95
    const f: ParsedField[] = []

    const payeeLine = findLine(lines, ['收款单位', '收款人', '商户'])
    if (payeeLine) {
      const label = payeeLine.text.includes('收款单位') ? '收款单位' : payeeLine.text.includes('收款人') ? '收款人' : '商户'
      const v = valueAfterLabel(payeeLine.text, label)
      if (v) f.push(field('payee', '收款单位', v, payeeLine.score || fallback))
    }

    const date = extractDate(rawText)
    if (date) f.push(field('date', '日期', date, fallback * 0.95))

    let amount: number | null = null
    let amountConfidence = fallback * 0.95
    const amountLine = findLine(lines, ['实收', '金额（大写）', '金额(大写)', '大写金额', '人民币'])
    if (amountLine) {
      amount = extractMoney(amountLine.text)
      if (amount === null) amount = cnyUppercaseToNumber(amountLine.text)
      amountConfidence = amountLine.score || amountConfidence
    }
    if (amount === null) {
      const moneyLine = findLine(lines, ['金额'])
      if (moneyLine) {
        amount = extractMoney(moneyLine.text)
        amountConfidence = moneyLine.score || amountConfidence
      }
    }
    if (amount !== null) f.push(field('amount', '金额', amount, amountConfidence))

    const summaryLine = findLine(lines, ['摘要'])
    if (summaryLine) {
      const v = valueAfterLabel(summaryLine.text, '摘要')
      if (v) f.push(field('summary', '摘要', v, summaryLine.score || fallback))
    }

    return f
  },
}
