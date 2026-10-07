import type { OcrBox } from '../../ocr/ocr.types'
import type { DocumentParser, ParsedField, ParseContext } from './parser.types'
import {
  cnyUppercaseToNumber,
  extractAllMoney,
  extractDate,
  extractInvoiceNo,
  extractMoney,
  extractTaxNo,
  field,
  findLine,
  linesBetween,
  norm,
  valueAfterLabel,
} from './parser.utils'

const STRONG: Array<[string, number]> = [
  ['电子发票(增值税专用发票)', 8],
  ['增值税电子专用发票', 8],
  ['增值税专用发票', 8],
  ['电子发票(普通发票)', 7],
  ['增值税电子普通发票', 7],
  ['增值税普通发票', 7],
  ['通行费电子发票', 6],
  ['电子发票', 5],
]

/** 行内值截断：遇到后续标签即停（"名称：XX 纳税人识别号：yyy" 只取 XX） */
function cutAtLabel(value: string, labels: string[]): string {
  let best = value.length
  for (const l of labels) {
    const i = value.indexOf(l)
    if (i >= 0 && i < best) best = i
  }
  return value.slice(0, best).trim()
}

function detectInvoiceType(t: string): string {
  if (t.includes('电子发票(增值税专用发票)') || t.includes('增值税电子专用发票')) return '电子专票'
  if (t.includes('电子发票(普通发票)') || t.includes('增值税电子普通发票')) return '电子普票'
  if (t.includes('增值税专用发票')) return '增值税专用发票'
  if (t.includes('通行费电子发票')) return '通行费电子发票'
  if (t.includes('增值税普通发票')) return '增值税普通发票'
  if (t.includes('电子发票')) return '电子发票'
  return '增值税发票'
}

/** 取区域内"名称/纳税人识别号"值 */
function pickParty(zone: OcrBox[], fallback: number): { name: string; taxNo: string } {
  const nameLine = findLine(zone, ['名称', '购买方名称', '销售方名称'])
  let name = ''
  if (nameLine) {
    const raw = valueAfterLabel(nameLine.text, '名称')
    if (raw) name = cutAtLabel(raw, ['纳税人识别号', '统一社会信用代码', '地址', '电话', '开户行'])
  }
  if (!name && zone.length > 0) name = zone[0].text.trim()

  let taxNo = ''
  const taxLine = findLine(zone, ['纳税人识别号', '统一社会信用代码'])
  if (taxLine) {
    const raw = valueAfterLabel(taxLine.text, taxLine.text.includes('统一社会信用代码') ? '统一社会信用代码' : '纳税人识别号')
    if (raw) taxNo = cutAtLabel(raw, ['地址', '电话', '开户行'])
  }
  if (!taxNo && zone.length > 0) {
    for (const l of zone) {
      const t = extractTaxNo(l.text)
      if (t) {
        taxNo = t
        break
      }
    }
  }
  void fallback
  return { name, taxNo }
}

function parseItems(ctx: ParseContext): string[] {
  const { lines } = ctx
  const header = findLine(lines, ['项目名称', '货物或应税劳务', '服务名称', '项目'])
  if (!header) return []
  const endAnchor = findLine(lines, ['价税合计', '合计']) ?? null
  const zone = linesBetween(lines, header, endAnchor)
  const items: string[] = []
  for (const l of zone) {
    const t = norm(l.text)
    const hasMoney = extractMoney(l.text) !== null
    const hasPercent = t.includes('%')
    if (hasMoney || hasPercent || t.includes('免税') || t.includes('不征税')) {
      items.push(l.text.trim())
    }
  }
  return items
}

export const invoiceParser: DocumentParser = {
  type: 'invoice',
  typeName: '增值税发票',

  match(ctx: ParseContext): number {
    const t = norm(ctx.rawText)
    let score = 0
    let hasStrong = false
    for (const [k, s] of STRONG) {
      if (t.includes(k)) {
        score += s
        hasStrong = true
      }
    }
    if (t.includes('发票代码')) score += 3
    if (t.includes('发票号码')) score += 3
    if (t.includes('价税合计')) score += 3
    if (t.includes('开票日期')) score += 2
    if (t.includes('购买方')) score += 2
    if (t.includes('销售方')) score += 2

    if (t.includes('居民身份证') || t.includes('身份证') || t.includes('营业执照') || t.includes('火车票')) {
      score -= 12
    }
    const hasInvoice = t.includes('发票')
    const hasCodeNo = t.includes('发票代码') || t.includes('发票号码') || t.includes('价税合计')
    if (!hasInvoice || !(hasStrong || hasCodeNo)) return -100
    return score
  },

  parse(ctx: ParseContext): ParsedField[] {
    const { lines, rawText } = ctx
    const t = norm(rawText)
    const fallback = ctx.source === 'pdf' ? 1 : 0.95
    const f: ParsedField[] = []

    f.push(field('invoice_type', '发票类型', detectInvoiceType(t), fallback))

    const codeLine = findLine(lines, ['发票代码'])
    if (codeLine) {
      const v = cutAtLabel(valueAfterLabel(codeLine.text, '发票代码') ?? codeLine.text, ['发票号码', '开票日期'])
      f.push(field('invoice_code', '发票代码', v, codeLine.score || fallback))
    } else {
      const v = extractInvoiceNo(rawText)
      if (v) f.push(field('invoice_code', '发票代码', v, fallback * 0.9))
    }

    const noLine = findLine(lines, ['发票号码'])
    if (noLine) {
      const v = cutAtLabel(valueAfterLabel(noLine.text, '发票号码') ?? noLine.text, ['开票日期', '发票代码'])
      f.push(field('invoice_no', '发票号码', v, noLine.score || fallback))
    } else {
      const v = extractInvoiceNo(rawText)
      if (v) f.push(field('invoice_no', '发票号码', v, fallback * 0.9))
    }

    const dateLine = findLine(lines, ['开票日期'])
    const belowDate = dateLine ? findBelowDate(dateLine, lines) : null
    const issueDate = dateLine
      ? extractDate(dateLine.text) ?? (belowDate ? extractDate(belowDate.text) : null)
      : extractDate(rawText)
    if (issueDate) f.push(field('issue_date', '开票日期', issueDate, dateLine?.score || fallback))

    const buyerAnchor = findLine(lines, ['购买方'])
    const sellerAnchor = findLine(lines, ['销售方'])
    const remarkAnchor = findLine(lines, ['备注', '收款人', '复核', '开票人'])
    const buyerZone = linesBetween(lines, buyerAnchor, sellerAnchor)
    const sellerZone = sellerAnchor ? linesBetween(lines, sellerAnchor, remarkAnchor) : []

    const buyer = pickParty(buyerZone, fallback)
    const seller = pickParty(sellerZone, fallback)
    if (buyer.name) f.push(field('buyer_name', '购买方名称', buyer.name, fallback * 0.95))
    if (buyer.taxNo) f.push(field('buyer_tax_no', '购买方纳税人识别号', buyer.taxNo, fallback * 0.95))
    if (seller.name) f.push(field('seller_name', '销售方名称', seller.name, fallback * 0.95))
    if (seller.taxNo) f.push(field('seller_tax_no', '销售方纳税人识别号', seller.taxNo, fallback * 0.95))

    const sumLine = findLine(lines, ['合计'])
    if (sumLine) {
      const moneys = extractAllMoney(sumLine.text)
      if (moneys.length > 0) f.push(field('amount', '合计金额', moneys[0], sumLine.score || fallback))
      if (moneys.length > 1) f.push(field('tax_amount', '合计税额', moneys[1], sumLine.score || fallback))
    } else {
      const amtLine = findLine(lines, ['金额合计', '金额'])
      const taxLine = findLine(lines, ['税额'])
      if (amtLine) {
        const v = extractMoney(amtLine.text)
        if (v !== null) f.push(field('amount', '合计金额', v, amtLine.score || fallback))
      }
      if (taxLine) {
        const v = extractMoney(taxLine.text)
        if (v !== null) f.push(field('tax_amount', '合计税额', v, taxLine.score || fallback))
      }
    }

    const totalLine = findLine(lines, ['价税合计'])
    if (totalLine) {
      let total = extractMoney(totalLine.text)
      if (total === null) {
        const below = findLine(lines, ['小写'])
        total = below ? extractMoney(below.text) ?? null : null
      }
      if (total === null) total = cnyUppercaseToNumber(totalLine.text)
      if (total !== null) f.push(field('total_amount', '价税合计', total, totalLine.score || fallback))
    }

    const items = parseItems(ctx)
    if (items.length > 0) f.push(field('items', '项目明细', items.join('；'), fallback * 0.9))

    return f
  },
}

function findBelowDate(dateLine: OcrBox, lines: OcrBox[]): OcrBox | null {
  const ys = dateLine.points.map((p) => p[1])
  const ay = (Math.min(...ys) + Math.max(...ys)) / 2
  let best: OcrBox | null = null
  let bestDy = Infinity
  for (const l of lines) {
    if (l === dateLine) continue
    const ys2 = l.points.map((p) => p[1])
    const dy = (Math.min(...ys2) + Math.max(...ys2)) / 2 - ay
    if (dy > 2 && dy < bestDy) {
      bestDy = dy
      best = l
    }
  }
  return best
}
