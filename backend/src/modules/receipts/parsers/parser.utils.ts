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

/** 提取行内首个金额（支持 ¥、￥、千分位、最多两位小数） */
export function extractMoney(text: string): number | null {
  const m = text.match(/(?:¥|￥|\$)?\s*(\d{1,12}(?:,\d{3})*(?:\.\d{1,2})?)/)
  if (!m) return null
  const n = parseFloat(m[1].replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/** 提取行内全部金额（按出现顺序） */
export function extractAllMoney(text: string): number[] {
  const out: number[] = []
  const re = /(?:¥|￥|\$)?(\d{1,12}(?:,\d{3})*(?:\.\d{1,2})?)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const n = parseFloat(m[1].replace(/,/g, ''))
    if (Number.isFinite(n)) out.push(n)
  }
  return out
}

/** 提取行内日期，归一化为 YYYY-MM-DD */
export function extractDate(text: string): string | null {
  const m = text.match(/(\d{4})\s*[年\-/.]\s*(\d{1,2})\s*[月\-/.]\s*(\d{1,2})\s*日?/)
  if (!m) return null
  return `${m[1]}-${String(+m[2]).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}`
}

/** 提取 18 位统一社会信用代码 / 纳税人识别号 */
export function extractTaxNo(text: string): string | null {
  const m = text.match(/(?:^|[^0-9A-Za-z])([0-9A-HJ-NPQRTUWXY]{18})(?:$|[^0-9A-Za-z])/)
  return m ? m[1].toUpperCase() : null
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
