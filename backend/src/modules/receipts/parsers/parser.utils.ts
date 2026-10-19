import type { OcrBox } from '../../ocr/ocr.types'
import type { ParsedField } from './parser.types'

const FULL = '　０１２３４５６７８９ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ：，。％￥（）：；·'
const HALF = ' 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz:,.%$():;.'

/** 全角转半角 + 去空白 + 大写（仅用于关键词匹配，不用于取值） */
export function norm(text: string): string {
  let s = text
  for (let i = 0; i < FULL.length; i++) {
    s = s.split(FULL[i]).join(HALF[i])
  }
  return s.replace(/\s+/g, '').toUpperCase()
}

/** 取标签后的行内值：处理 "发票代码：12345" / "发票代码 12345" / "发票代码12345" */
export function valueAfterLabel(text: string, label: string): string | null {
  const idx = text.indexOf(label)
  if (idx < 0) return null
  const rest = text.slice(idx + label.length).replace(/^[:：\s　]+/, '')
  return rest.trim() || null
}

/**
 * 名称归一化：去全部空白 + 全角/半角标点统一为半角。
 * OCR 票面常用半角括号「(个体工商户)」，公司档案常录全角「（个体工商户）」，
 * 不统一标点会让「本公司比对」和往来单位查重全部失配。
 */
export function normName(s: string): string {
  return s
    .replace(/\s+/g, '')
    .replace(/[（｛［【〔]/g, '(')
    .replace(/[）｝］】〕]/g, ')')
    .replace(/[，]/g, ',')
    .replace(/[：]/g, ':')
    .replace(/[。]/g, '.')
}

/** 归一化名称互相包含（票面名常缺「(个体工商户)」等后缀，单向包含会漏配） */
export function nameContains(a: string, b: string): boolean {
  if (!a || !b) return false
  return a.includes(b) || b.includes(a)
}

/** 在行列表中找首个含任一关键词的行（关键词匹配去格式后文本） */
export function findLine(lines: OcrBox[], keywords: string[]): OcrBox | null {
  const nk = keywords.map((k) => norm(k))
  for (const line of lines) {
    const t = norm(line.text)
    if (nk.some((k) => t.includes(k))) return line
  }
  return null
}

/** 取两个锚点行之间的行（按 y 排序），不包含锚点行 */
export function linesBetween(
  lines: OcrBox[],
  start: OcrBox | null,
  end: OcrBox | null,
): OcrBox[] {
  if (!start) return []
  const cyStart = centerY(start)
  const cyEnd = end ? centerY(end) : Infinity
  return lines
    .filter((l) => l !== start && l !== end)
    .filter((l) => {
      const cy = centerY(l)
      return cy > cyStart && cy < cyEnd
    })
    .sort((a, b) => centerY(a) - centerY(b))
}

export function centerY(line: OcrBox): number {
  const ys = line.points.map((p) => p[1])
  return (Math.min(...ys) + Math.max(...ys)) / 2
}

export function centerX(line: OcrBox): number {
  const xs = line.points.map((p) => p[0])
  return (Math.min(...xs) + Math.max(...xs)) / 2
}

export function lineWidth(line: OcrBox): number {
  const xs = line.points.map((p) => p[0])
  return Math.max(...xs) - Math.min(...xs)
}

export function lineHeight(line: OcrBox): number {
  const ys = line.points.map((p) => p[1])
  return Math.max(...ys) - Math.min(...ys)
}

/** 锚点行正下方最近的行（dy 在 (2, maxDy] 内） */
export function findBelow(lines: OcrBox[], anchor: OcrBox, maxDy: number): OcrBox | null {
  const ay = centerY(anchor)
  let best: OcrBox | null = null
  let bestDy = Infinity
  for (const line of lines) {
    if (line === anchor) continue
    const dy = centerY(line) - ay
    if (dy > 2 && dy <= maxDy && dy < bestDy) {
      bestDy = dy
      best = line
    }
  }
  return best
}

/** 锚点行同一行带内右侧的文本行（值被拆成独立行时用） */
export function findRight(lines: OcrBox[], anchor: OcrBox, maxDx: number): OcrBox | null {
  const ax = centerX(anchor)
  const ay = centerY(anchor)
  let best: OcrBox | null = null
  let bestDx = Infinity
  for (const line of lines) {
    if (line === anchor) continue
    if (Math.abs(centerY(line) - ay) > 3) continue
    const dx = centerX(line) - ax
    if (dx > 2 && dx <= maxDx && dx < bestDx) {
      bestDx = dx
      best = line
    }
  }
  return best
}

/** 提取行内首个金额（支持 ¥、￥、千分位、最多两位小数；支持负数金额——红字/红冲发票票面金额为负） */
export function extractMoney(text: string): number | null {
  const m = text.match(/(?:¥|￥|\$)?\s*(-|－)?\s*(\d{1,12}(?:,\d{3})*(?:\.\d{1,2})?)/)
  if (!m) return null
  const n = parseFloat(m[2].replace(/,/g, ''))
  if (!Number.isFinite(n)) return null
  return m[1] ? -n : n
}

/** 提取行内全部金额（按出现顺序，支持负数金额） */
export function extractAllMoney(text: string): number[] {
  const out: number[] = []
  const re = /(?:¥|￥|\$)?\s*(-|－)?\s*(\d{1,12}(?:,\d{3})*(?:\.\d{1,2})?)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const n = parseFloat(m[2].replace(/,/g, ''))
    if (Number.isFinite(n)) out.push(m[1] ? -n : n)
  }
  return out
}

/** 提取行内日期，归一化为 YYYY-MM-DD */
export function extractDate(text: string): string | null {
  const m = text.match(/(\d{4})\s*[年\-/.]\s*(\d{1,2})\s*[月\-/.]\s*(\d{1,2})\s*日?/)
  if (!m) return null
  return `${m[1]}-${String(+m[2]).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}`
}

/** 统一社会信用代码合法字符集（不含 I/O，避免与 1/0 混淆） */
const TAX_NO_CHARSET_RE = /^[0-9A-HJ-NPQRTUWXY]{18}$/

/**
 * 税号归一化（仅用于匹配/比对场景）：全角转半角、去空白、大写、I→1、O→0。
 * 统一社会信用代码字符集本就不含 I/O，候选中出现的 I/O 只能是 OCR 误读，
 * 替换后符合 18 位合法字符集才返回结果，否则返回 null（不误伤非税号文本）。
 */
export function normalizeTaxNo(raw: string): string | null {
  let s = raw
  for (let i = 0; i < FULL.length; i++) {
    s = s.split(FULL[i]).join(HALF[i])
  }
  s = s.replace(/\s+/g, '').toUpperCase().replace(/I/g, '1').replace(/O/g, '0')
  return TAX_NO_CHARSET_RE.test(s) ? s : null
}

/** 税号比对：先精确（忽略大小写），再归一化容错（兼容 OCR 把 1/0 误读成 I/O） */
export function sameTaxNo(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a.toUpperCase() === b.toUpperCase()) return true
  const na = normalizeTaxNo(a)
  const nb = normalizeTaxNo(b)
  return na !== null && nb !== null && na === nb
}

/** 提取 18 位统一社会信用代码 / 纳税人识别号（容忍数字间空格/全角空格）。
 * 严格字符集匹配失败时对含 I/O 的 18 位候选做归一化重试：
 * OCR 可能把 1/0 误读成 I/O（如 92610112MAKL12AH6X → …MAKLI2AH6X），
 * 替换后格式合法才采用，保证解析值与真实税号一致。 */
export function extractTaxNo(text: string): string | null {
  const re = /(?:^|[^0-9A-Za-z])([0-9A-HJ-NPQRTUWXY]{18})(?:$|[^0-9A-Za-z])/
  const m = text.match(re)
  if (m) return m[1].toUpperCase()
  const compact = text.replace(/[\s\u3000]+/g, '')
  if (compact !== text) {
    const m2 = compact.match(re)
    if (m2) return m2[1].toUpperCase()
  }
  // 宽松重试：候选允许含 I/O（含小写），归一化后符合合法字符集才采用
  const loose = /(?:^|[^0-9A-Za-z])([0-9A-Za-z]{18})(?:$|[^0-9A-Za-z])/.exec(compact)
  return loose ? normalizeTaxNo(loose[1]) : null
}

/** 提取 18 位身份证号（末位可为 X） */
export function extractIdCard(text: string): string | null {
  const m = text.match(/(?:^|[^0-9A-Za-z])(\d{17}[\dXx])(?:$|[^0-9A-Za-z])/)
  return m ? m[1].toUpperCase() : null
}

/** 提取 8-12 位发票号码/发票代码 */
export function extractInvoiceNo(text: string): string | null {
  const m = text.match(/(?:^|[^0-9])(\d{8,12})(?:$|[^0-9])/)
  return m ? m[1] : null
}

const CN_NUMS: Record<string, number> = { 零: 0, 壹: 1, 贰: 2, 叁: 3, 肆: 4, 伍: 5, 陆: 6, 柒: 7, 捌: 8, 玖: 9 }
const CN_UNITS: Record<string, number> = { 拾: 10, 佰: 100, 仟: 1000, 万: 10000, 亿: 100000000 }

/** 人民币大写金额转数字（整数元场景；"壹仟零陆拾元整" → 1060） */
export function cnyUppercaseToNumber(text: string): number | null {
  let total = 0
  let section = 0
  let num = 0
  let hasAny = false
  for (const ch of text) {
    if (ch in CN_NUMS) {
      num = CN_NUMS[ch]
      hasAny = true
    } else if (ch in CN_UNITS) {
      const u = CN_UNITS[ch]
      if (u >= 10000) {
        section = (section + num) * u
        total += section
        section = 0
      } else {
        section += (num || 1) * u
      }
      num = 0
    } else if (ch === '元' || ch === '圆') {
      section += num
      num = 0
      total += section
      section = 0
    }
    // 角/分/整：对整数元场景忽略
  }
  if (num) section += num
  total += section
  return hasAny ? total : null
}

/** 组装字段 */
export function field(
  key: string,
  label: string,
  value: string | number | null,
  confidence: number,
): ParsedField {
  return { key, label, value, confidence }
}

/** 从行取标签后的值：先同行，再查下一行（值被 OCR 拆到下一行的情况） */
export function takeLabelValue(
  lines: OcrBox[],
  label: string,
  confidenceFallback: number,
): { value: string; confidence: number } | null {
  const line = findLine(lines, [label])
  if (!line) return null
  const inline = valueAfterLabel(line.text, label)
  if (inline) return { value: inline, confidence: line.score || confidenceFallback }
  const below = findBelow(lines, line, 60)
  if (below && below !== line) {
    return { value: below.text.trim(), confidence: below.score || confidenceFallback }
  }
  return null
}
