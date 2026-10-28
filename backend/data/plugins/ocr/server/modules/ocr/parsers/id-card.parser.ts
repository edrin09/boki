import type { DocumentParser, ParsedField, ParseContext } from './parser.types'
import {
  extractDate,
  extractIdCard,
  field,
  findLine,
  norm,
  valueAfterLabel,
} from './parser.utils'

export const idCardParser: DocumentParser = {
  type: 'id_card',
  typeName: '居民身份证',

  match(ctx: ParseContext): number {
    const t = norm(ctx.rawText)
    let score = 0
    if (t.includes('居民身份证')) score += 6
    if (t.includes('公民身份号码')) score += 5
    if (extractIdCard(ctx.rawText)) score += 4
    if (t.includes('姓名')) score += 1
    if (t.includes('性别')) score += 1
    if (t.includes('民族')) score += 1
    if (t.includes('住址')) score += 1
    if (t.includes('签发机关')) score += 1
    if (t.includes('发票') || t.includes('营业执照') || t.includes('火车票')) score -= 12
    return score
  },

  parse(ctx: ParseContext): ParsedField[] {
    const { lines, rawText } = ctx
    const fallback = ctx.source === 'pdf' ? 1 : 0.95
    const f: ParsedField[] = []

    const nameLine = findLine(lines, ['姓名'])
    if (nameLine) {
      const v = valueAfterLabel(nameLine.text, '姓名')
      if (v) f.push(field('name', '姓名', v, nameLine.score || fallback))
    }
    const genderLine = findLine(lines, ['性别'])
    if (genderLine) {
      const v = valueAfterLabel(genderLine.text, '性别')
      if (v) f.push(field('gender', '性别', v, genderLine.score || fallback))
    }
    const nationLine = findLine(lines, ['民族'])
    if (nationLine) {
      const v = valueAfterLabel(nationLine.text, '民族')
      if (v) f.push(field('nation', '民族', v, nationLine.score || fallback))
    }
    const birthLine = findLine(lines, ['出生'])
    if (birthLine) {
      const v = extractDate(birthLine.text) ?? valueAfterLabel(birthLine.text, '出生')
      if (v) f.push(field('birth', '出生', v, birthLine.score || fallback))
    }
    const addrLine = findLine(lines, ['住址'])
    if (addrLine) {
      const v = valueAfterLabel(addrLine.text, '住址')
      if (v) f.push(field('address', '住址', v, addrLine.score || fallback))
    }
    const idCard = extractIdCard(rawText)
    if (idCard) f.push(field('id_card', '公民身份号码', idCard, fallback * 0.95))
    const issueLine = findLine(lines, ['签发机关'])
    if (issueLine) {
      const v = valueAfterLabel(issueLine.text, '签发机关')
      if (v) f.push(field('issue_org', '签发机关', v, issueLine.score || fallback))
    }
    const validLine = findLine(lines, ['有效期限'])
    if (validLine) {
      const v = valueAfterLabel(validLine.text, '有效期限')
      if (v) f.push(field('validity', '有效期限', v, validLine.score || fallback))
    }

    return f
  },
}
