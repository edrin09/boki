import type { DocumentParser, ParsedField, ParseContext } from './parser.types'
import {
  extractDate,
  extractTaxNo,
  field,
  findLine,
  norm,
  valueAfterLabel,
} from './parser.utils'

export const businessLicenseParser: DocumentParser = {
  type: 'business_license',
  typeName: '营业执照',

  match(ctx: ParseContext): number {
    const t = norm(ctx.rawText)
    let score = 0
    if (t.includes('营业执照')) score += 6
    if (t.includes('统一社会信用代码')) score += 5
    if (extractTaxNo(ctx.rawText)) score += 3
    if (t.includes('经营范围')) score += 2
    if (t.includes('注册资本')) score += 2
    if (t.includes('法定代表人')) score += 2
    if (t.includes('成立日期')) score += 1
    if (t.includes('发票') || t.includes('身份证') || t.includes('火车票')) score -= 12
    // 营业执照正文无"发票"字样，但单据标题可能带，弱排除不算强证据
    return score
  },

  parse(ctx: ParseContext): ParsedField[] {
    const { lines, rawText } = ctx
    const fallback = ctx.source === 'pdf' ? 1 : 0.95
    const f: ParsedField[] = []

    const nameLine = findLine(lines, ['名称'])
    if (nameLine) {
      const v = valueAfterLabel(nameLine.text, '名称')
      if (v) f.push(field('company_name', '名称', v, nameLine.score || fallback))
    }
    const credit = extractTaxNo(rawText)
    if (credit) f.push(field('credit_code', '统一社会信用代码', credit, fallback * 0.95))

    const legalLine = findLine(lines, ['法定代表人'])
    if (legalLine) {
      const v = valueAfterLabel(legalLine.text, '法定代表人')
      if (v) f.push(field('legal_person', '法定代表人', v, legalLine.score || fallback))
    }
    const capitalLine = findLine(lines, ['注册资本'])
    if (capitalLine) {
      const v = valueAfterLabel(capitalLine.text, '注册资本')
      if (v) f.push(field('registered_capital', '注册资本', v, capitalLine.score || fallback))
    }
    const foundedLine = findLine(lines, ['成立日期'])
    if (foundedLine) {
      const v = extractDate(foundedLine.text) ?? valueAfterLabel(foundedLine.text, '成立日期')
      if (v) f.push(field('founded_date', '成立日期', v, foundedLine.score || fallback))
    }
    const termLine = findLine(lines, ['营业期限'])
    if (termLine) {
      const v = valueAfterLabel(termLine.text, '营业期限')
      if (v) f.push(field('business_term', '营业期限', v, termLine.score || fallback))
    }
    const scopeLine = findLine(lines, ['经营范围'])
    if (scopeLine) {
      const v = valueAfterLabel(scopeLine.text, '经营范围')
      if (v) f.push(field('business_scope', '经营范围', v, scopeLine.score || fallback))
    }
    const addrLine = findLine(lines, ['住所'])
    if (addrLine) {
      const v = valueAfterLabel(addrLine.text, '住所')
      if (v) f.push(field('address', '住所', v, addrLine.score || fallback))
    }

    return f
  },
}
