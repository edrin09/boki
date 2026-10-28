import type { OcrBox } from '../engine/ocr.types'
import type { DocumentParser, ParsedField, ParseContext } from './parser.types'
import {
  cnyUppercaseToNumber,
  extractAllMoney,
  extractDate,
  extractInvoiceNo,
  extractMoney,
  extractTaxNo,
  field,
  findBelow,
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

interface PartyInfo {
  name: string
  taxNo: string
  address: string
  phone: string
  bank: string
  bankAccount: string
}

/** 生成可容忍标签内部空格的匹配（「名 称」→ 名[\s]*称） */
function labelPattern(label: string): RegExp {
  const esc = label
    .split('')
    .map((c) => (/[.*+?^${}()|[\]\\]/.test(c) ? `\\${c}` : c))
    .join('[\\s\\u3000]*')
  return new RegExp(esc, 'g')
}

/** 按出现顺序取一行内所有「标签后值」；合并标签（如「统一社会信用代码/纳税人识别号」）覆盖其子标签，避免重复取值 */
function allValuesAfterLabels(text: string, labels: string[]): string[] {
  const hits: Array<{ index: number; len: number }> = []
  for (const l of labels) {
    const re = labelPattern(l)
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      hits.push({ index: m.index, len: m[0].length })
      if (m.index === re.lastIndex) re.lastIndex++
    }
  }
  if (hits.length === 0) return []
  hits.sort((a, b) => a.index - b.index)
  const merged: Array<{ index: number; len: number }> = []
  for (const h of hits) {
    const last = merged[merged.length - 1]
    if (last && h.index < last.index + last.len) {
      if (h.index + h.len > last.index + last.len) last.len = h.index + h.len - last.index
    } else {
      merged.push({ index: h.index, len: h.len })
    }
  }
  const out: string[] = []
  for (let i = 0; i < merged.length; i++) {
    const start = merged[i].index + merged[i].len
    const end = i + 1 < merged.length ? merged[i + 1].index : text.length
    out.push(text.slice(start, end).replace(/^[:：\s\u3000]+/, '').trim())
  }
  return out
}

/** 名称值清理：去行首/行尾残留的竖排标签字（购/买/销/售/方/信/息）与空白 */
function cleanPartyName(v: string): string {
  return v
    .replace(/^[\s　]*[购销售方信][\s　]*/, '')
    .replace(/[\s　]*[购销售方信][\s　]*$/, '')
    .replace(/[\s　]+/g, '')
    .trim()
    .slice(0, 100)
}

/** 地址/电话拆分：兼容「地址、电话：xx 0571-xx」合并值与同行「地址：xx 电话：yyy」分离标签 */
function splitAddressPhone(v: string): { address: string; phone: string } {
  const res = { address: '', phone: '' }
  let s = v.trim()
  if (!s) return res
  if (s.includes('电话')) {
    const [a, ...rest] = s.split('电话')
    res.address = a.replace(/[;；\s]+$/, '').trim()
    res.phone = rest.join('电话').replace(/^[:：\s\u3000]+/, '').replace(/[^\d\-－]+$/, '').trim()
  } else {
    const m = s.match(/(1[3-9]\d{9}|0\d{2,3}[-－]?\d{7,8})\s*$/)
    if (m) {
      res.address = s.slice(0, m.index).replace(/[\s,，、:：;；]+$/, '')
      res.phone = m[1]
    } else {
      res.address = s
    }
  }
  return res
}

/** 开户行/账号拆分：尾部 12 位以上数字视为账号，去掉「;银行账号」等残留 */
function splitBank(v: string): { bank: string; bankAccount: string } {
  const res = { bank: '', bankAccount: '' }
  let s = v.trim()
  if (!s) return res
  const m = s.match(/(\d{12,25})[\s;；,，、:：]*$/)
  if (m) {
    res.bank = s
      .slice(0, m.index)
      .replace(/[;；,，]?\s*银行账号\s*[:：]?\s*$/, '')
      .replace(/[\s　]+/g, '')
    res.bankAccount = m[1]
  } else {
    res.bank = s.replace(/[\s　]+/g, '')
  }
  return res
}

/** 行的水平中心 x */
function centerXOf(line: OcrBox): number {
  const xs = line.points.map((p) => p[0])
  return (Math.min(...xs) + Math.max(...xs)) / 2
}

/** 全页列中线（双栏发票按此判断购/销方在左/右列） */
function pageMidX(lines: OcrBox[]): number {
  let min = Infinity
  let max = -Infinity
  for (const l of lines) {
    const xs = l.points.map((p) => p[0])
    min = Math.min(min, ...xs)
    max = Math.max(max, ...xs)
  }
  return min + (max - min) / 2
}

/**
 * 提取购销双方信息（发票双栏布局：购方左/上、销方右/下）。
 * 双栏合并行（一行内标签出现两次）按出现顺序拆分：第一个=购方、第二个=销方；
 * 单栏布局（购方块在上、销方块在下）按行序同样对应。
 * 地址/开户行按「购买方/销售方」显式标签确定归属，否则按列位置（左=购方）。
 */
function extractParties(lines: OcrBox[], fallback: number): { buyer: PartyInfo; seller: PartyInfo } {
  const buyer: PartyInfo = { name: '', taxNo: '', address: '', phone: '', bank: '', bankAccount: '' }
  const seller: PartyInfo = { name: '', taxNo: '', address: '', phone: '', bank: '', bankAccount: '' }
  const mid = pageMidX(lines)

  // 名称：排除「项目名称/服务名称/货物或应税劳务」等表头行
  const isNameRow = (l: OcrBox) => {
    const t = norm(l.text)
    return t.includes('名称') && !t.includes('项目名称') && !t.includes('服务名称') && !t.includes('货物或应税劳务')
  }
  let nameIdx = 0
  for (const l of lines) {
    if (!isNameRow(l)) continue
    for (const n of allValuesAfterLabels(l.text, ['名称'])) {
      const clean = cleanPartyName(n)
      if (!clean) continue
      if (nameIdx === 0) buyer.name = clean
      else if (nameIdx === 1) seller.name = clean
      nameIdx++
    }
  }

  // 税号：双栏行依次取值，逐值校验 18 位；标签行值空时续接下一行
  const TAX_LABELS = ['统一社会信用代码/纳税人识别号', '纳税人识别号/统一社会信用代码', '统一社会信用代码', '纳税人识别号']
  let taxIdx = 0
  for (const l of lines) {
    const t = norm(l.text)
    if (!t.includes('纳税人识别号') && !t.includes('统一社会信用代码')) continue
    for (const raw of allValuesAfterLabels(l.text, TAX_LABELS)) {
      let taxNo = extractTaxNo(raw)
      if (!taxNo) {
        const below = findBelow(lines, l, 80)
        if (below) taxNo = extractTaxNo(below.text)
      }
      if (!taxNo) continue
      if (taxIdx === 0) buyer.taxNo = taxNo
      else if (taxIdx === 1) seller.taxNo = taxNo
      taxIdx++
    }
  }

  // 地址/电话
  for (const l of lines) {
    const t = norm(l.text)
    if (!t.includes('地址')) continue
    const side =
      t.includes('购买方') || t.includes('购方') ? buyer
      : t.includes('销售方') || t.includes('销方') ? seller
      : centerXOf(l) < mid ? buyer
      : seller
    const vals = allValuesAfterLabels(l.text, ['地址、电话', '地址'])
    if (vals[0]) {
      const { address, phone } = splitAddressPhone(vals[0])
      if (address) side.address = address
      if (phone) side.phone = phone
    }
  }

  // 开户行/账号
  for (const l of lines) {
    const t = norm(l.text)
    if (!t.includes('开户行') && !t.includes('开户银行')) continue
    const side =
      t.includes('购买方') || t.includes('购方') ? buyer
      : t.includes('销售方') || t.includes('销方') ? seller
      : centerXOf(l) < mid ? buyer
      : seller
    const vals = allValuesAfterLabels(l.text, ['开户行及账号', '开户银行', '开户行'])
    if (vals[0]) {
      const { bank, bankAccount } = splitBank(vals[0])
      if (bank) side.bank = bank
      if (bankAccount) side.bankAccount = bankAccount
    }
  }

  void fallback
  return { buyer, seller }
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

    // 红字发票识别：票面含「红字」字样（如「红字发票信息表编号」），或发票号码带负数后缀（如 12345678-01）
    const noValue = f.find((x) => x.key === 'invoice_no')?.value
    if (t.includes('红字') || /-\d{1,2}$/.test(String(noValue ?? ''))) {
      f.push(field('is_red', '红字发票', 1, fallback))
      // 被冲销的原蓝字发票号码（数电红票票面「对应蓝字发票号码」等标签）
      const orig = t.match(
        /(?:对应蓝字发票号码|被冲销蓝字发票号码|原蓝字发票号码|蓝字发票号码|被冲销发票号码|原发票号码):?(\d{8,12}(?:-\d{1,2})?)/,
      )
      if (orig) f.push(field('original_invoice_no', '原蓝字发票号码', orig[1], fallback * 0.9))
    }

    const dateLine = findLine(lines, ['开票日期'])
    const belowDate = dateLine ? findBelowDate(dateLine, lines) : null
    const issueDate = dateLine
      ? extractDate(dateLine.text) ?? (belowDate ? extractDate(belowDate.text) : null)
      : extractDate(rawText)
    if (issueDate) f.push(field('issue_date', '开票日期', issueDate, dateLine?.score || fallback))

    const { buyer, seller } = extractParties(lines, fallback)
    if (buyer.name) f.push(field('buyer_name', '购买方名称', buyer.name, fallback * 0.95))
    if (buyer.taxNo) f.push(field('buyer_tax_no', '购买方纳税人识别号', buyer.taxNo, fallback * 0.95))
    if (buyer.address) f.push(field('buyer_address', '购买方地址', buyer.address, fallback * 0.9))
    if (buyer.phone) f.push(field('buyer_phone', '购买方电话', buyer.phone, fallback * 0.9))
    if (buyer.bank) f.push(field('buyer_bank', '购买方开户银行', buyer.bank, fallback * 0.9))
    if (buyer.bankAccount) f.push(field('buyer_bank_account', '购买方银行账号', buyer.bankAccount, fallback * 0.9))
    if (seller.name) f.push(field('seller_name', '销售方名称', seller.name, fallback * 0.95))
    if (seller.taxNo) f.push(field('seller_tax_no', '销售方纳税人识别号', seller.taxNo, fallback * 0.95))
    if (seller.address) f.push(field('seller_address', '销售方地址', seller.address, fallback * 0.9))
    if (seller.phone) f.push(field('seller_phone', '销售方电话', seller.phone, fallback * 0.9))
    if (seller.bank) f.push(field('seller_bank', '销售方开户银行', seller.bank, fallback * 0.9))
    if (seller.bankAccount) f.push(field('seller_bank_account', '销售方银行账号', seller.bankAccount, fallback * 0.9))

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
