import type { DocumentParser, ParsedField, ParseContext } from './parser.types'
import {
  extractDate,
  extractIdCard,
  extractMoney,
  field,
  findLine,
  norm,
  valueAfterLabel,
} from './parser.utils'

export const trainTicketParser: DocumentParser = {
  type: 'train_ticket',
  typeName: '火车票/行程单',

  match(ctx: ParseContext): number {
    const t = norm(ctx.rawText)
    let score = 0
    if (t.includes('火车票')) score += 6
    if (t.includes('行程信息提示')) score += 5
    if (t.includes('车次')) score += 3
    if (t.includes('票价')) score += 3
    if (t.includes('席别')) score += 2
    if (t.includes('出发')) score += 1
    if (t.includes('到达')) score += 1
    if (t.includes('发票') || t.includes('身份证') || t.includes('营业执照')) score -= 12
    return score
  },

  parse(ctx: ParseContext): ParsedField[] {
    const { lines, rawText } = ctx
    const fallback = ctx.source === 'pdf' ? 1 : 0.95
    const f: ParsedField[] = []

    const nameLine = findLine(lines, ['姓名'])
    if (nameLine) {
      const v = valueAfterLabel(nameLine.text, '姓名')
      if (v) f.push(field('passenger', '旅客姓名', v, nameLine.score || fallback))
    }
    const idCard = extractIdCard(rawText)
    if (idCard) f.push(field('id_card', '身份证号', idCard, fallback * 0.95))

    const trainLine = findLine(lines, ['车次'])
    if (trainLine) {
      const v = valueAfterLabel(trainLine.text, '车次')
      if (v) f.push(field('train_no', '车次', v, trainLine.score || fallback))
    }

    const fromLine = findLine(lines, ['出发', '始发站'])
    if (fromLine) {
      const v = valueAfterLabel(fromLine.text, fromLine.text.includes('始发站') ? '始发站' : '出发')
      if (v) f.push(field('from_station', '出发站', v, fromLine.score || fallback))
    }
    const toLine = findLine(lines, ['到达', '到达站'])
    if (toLine) {
      const v = valueAfterLabel(toLine.text, toLine.text.includes('到达站') ? '到达站' : '到达')
      if (v) f.push(field('to_station', '到达站', v, toLine.score || fallback))
    }

    const dateLine = findLine(lines, ['日期'])
    const date = dateLine ? extractDate(dateLine.text) : extractDate(rawText)
    if (date) f.push(field('travel_date', '乘车日期', date, dateLine?.score || fallback))

    const seatLine = findLine(lines, ['席别'])
    if (seatLine) {
      const v = valueAfterLabel(seatLine.text, '席别')
      if (v) f.push(field('seat_class', '席别', v, seatLine.score || fallback))
    }

    const priceLine = findLine(lines, ['票价'])
    if (priceLine) {
      const v = extractMoney(priceLine.text)
      if (v !== null) f.push(field('amount', '票价', v, priceLine.score || fallback))
    }

    return f
  },
}
