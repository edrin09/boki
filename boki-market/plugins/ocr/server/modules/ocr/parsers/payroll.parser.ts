import type { DocumentParser, ParsedField, ParseContext } from './parser.types'
import {
  extractDate,
  extractMoney,
  field,
  norm,
  takeLabelValue,
} from './parser.utils'

/** 工资表列（按优先级从左到右匹配，同一列不重复使用） */
const COLUMN_RULES: Array<{ key: string; label: string; keywords: string[] }> = [
  { key: 'base_salary', label: '基本工资', keywords: ['基本工资', '基础工资', '底薪', '岗位工资', '基本'] },
  { key: 'performance', label: '绩效工资', keywords: ['绩效工资', '绩效', '奖金', '提成'] },
  { key: 'allowance', label: '补贴', keywords: ['补贴', '津贴', '补助', '餐补', '交通补贴'] },
  { key: 'overtime', label: '加班费', keywords: ['加班'] },
  { key: 'insurance_personal', label: '个人社保', keywords: ['个人社保', '社保', '养老保险', '医疗保险', '失业保险'] },
  { key: 'fund_personal', label: '个人公积金', keywords: ['公积金', '住房公积金'] },
  { key: 'income_tax', label: '个人所得税', keywords: ['个人所得税', '个税', '所得税'] },
  { key: 'other_deduct', label: '其他扣款', keywords: ['其他扣款', '其他扣除', '扣款'] },
  { key: 'gross_amount', label: '应发工资', keywords: ['应发工资', '应发合计', '应发', '工资总额'] },
  { key: 'net_amount', label: '实发工资', keywords: ['实发工资', '实发合计', '实发', '到手'] },
]

/** 累加字段（决定工资凭证各科目金额） */
const SUM_KEYS = [
  'insurance_personal',
  'fund_personal',
  'income_tax',
  'other_deduct',
  'gross_amount',
  'net_amount',
] as const

/** 表头判定：含「姓名/员工」且至少命中一个工资列 */
function isHeader(line: string): boolean {
  const t = norm(line)
  if (!/姓名|员工|名字/.test(t)) return false
  return COLUMN_RULES.some((r) => r.keywords.some((k) => t.includes(norm(k))))
}

/** 按关键词把表头映射到列顺序；返回从左到右的字段列表 */
function mapColumns(header: string): string[] {
  const cells = header.split(/\s+/).filter(Boolean)
  const used = new Set<string>()
  const order: string[] = []
  for (const rule of COLUMN_RULES) {
    for (const cell of cells) {
      if (used.has(cell)) continue
      if (rule.keywords.some((k) => cell.includes(k))) {
        used.add(cell)
        order.push(rule.key)
        break
      }
    }
  }
  return order
}

const TOTAL_ROW = /^(合计|总计|小计|共计)/

/** 从若干候选 key 中取出已解析的值（用于派生合计字段） */
function pick(out: ParsedField[], key: string): number | null {
  const v = out.find((x) => x.key === key)?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** 从「2026年9月」「2026-09」「2026年09月份」中取工资期间 */
function extractPeriod(rawText: string): string | null {
  const m = rawText.match(/(\d{4})\s*[年\-/.]\s*(\d{1,2})\s*月?/)
  if (!m) return null
  const mm = String(Number(m[2])).padStart(2, '0')
  if (Number(m[2]) < 1 || Number(m[2]) > 12) return null
  return `${m[1]}-${mm}`
}

export const payrollParser: DocumentParser = {
  type: 'payroll',
  typeName: '工资表',

  match(ctx: ParseContext): number {
    const t = norm(ctx.rawText)
    let score = 0

    // 标题类强特征
    if (t.includes('工资表')) score += 6
    if (t.includes('工资单') || t.includes('工资条') || t.includes('薪资单')) score += 6
    if (t.includes('薪酬') || t.includes('薪资')) score += 4
    if (t.includes('代发工资') || t.includes('工资发放')) score += 3

    // 表头结构特征：姓名列 + 工资列
    const headerLines = ctx.lines.filter((l) => isHeader(l.text))
    if (headerLines.length) score += 6
    // 应发 + 实发同时出现，基本可确定是工资明细
    if (t.includes('应发') && t.includes('实发')) score += 3
    if (t.includes('基本工资') || t.includes('绩效工资')) score += 2

    // 排除其他单据
    if (t.includes('发票') || t.includes('价税合计')) score -= 12
    if (t.includes('身份证') || t.includes('营业执照') || t.includes('火车票')) score -= 12
    if (t.includes('对账单') || t.includes('交易明细') || t.includes('借方发生额')) score -= 8

    // 既没标题也没表头结构 → 不认为是工资表
    if (!headerLines.length && score < 6) return -100
    return score
  },

  parse(ctx: ParseContext): ParsedField[] {
    const { lines, rawText } = ctx
    const fallback = ctx.source === 'pdf' ? 0.95 : 0.85
    const f: ParsedField[] = []

    const period = extractPeriod(rawText)
    if (period) f.push(field('payroll_period', '工资期间', period, fallback))

    const headerIdx = lines.findIndex((l) => isHeader(l.text))
    if (headerIdx < 0) {
      // 没有表头：退化为「工资条」场景，按标签取值
      return this.parsePayslip(ctx, f, fallback)
    }

    const order = mapColumns(lines[headerIdx].text)
    const totals: Record<string, number> = {}
    let employeeCount = 0
    let sawTotalRow = false

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const text = lines[i].text.trim()
      if (!text) continue

      const numbers = [...text.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
      if (!numbers.length) continue

      if (TOTAL_ROW.test(text)) {
        // 合计行：优先采信（人工核对过的汇总）
        order.forEach((key, idx) => {
          const v = numbers[idx]
          if (typeof v === 'number' && Number.isFinite(v)) totals[key] = v
        })
        sawTotalRow = true
        continue
      }

      // 明细行：姓名不能是纯数字或空
      const nameMatch = text.match(/^([^\d]+)/)
      const employeeName = (nameMatch?.[1] ?? '').trim()
      if (!employeeName || /^\d+$/.test(employeeName)) continue
      employeeCount++
      order.forEach((key, idx) => {
        const v = numbers[idx]
        if (typeof v !== 'number' || !Number.isFinite(v)) return
        totals[key] = (totals[key] ?? 0) + v
      })
    }

    if (employeeCount > 0) {
      f.push(field('employee_count', '员工人数', employeeCount, sawTotalRow ? 1 : fallback))
    }

    // 应发合计缺失时用「实发 + 代扣合计」倒推
    const gross = totals.gross_amount
    if (gross === undefined) {
      const deduct = sumKeys(totals, ['insurance_personal', 'fund_personal', 'income_tax', 'other_deduct'])
      if (totals.net_amount !== undefined && deduct !== undefined) {
        f.push(field('gross_amount', '应发工资', round2(totals.net_amount + deduct), fallback * 0.8))
      }
    }

    for (const key of SUM_KEYS) {
      const v = totals[key]
      if (v === undefined) continue
      const rule = COLUMN_RULES.find((r) => r.key === key)!
      f.push(field(key, rule.label, round2(v), sawTotalRow ? 1 : fallback))
    }

    // 代扣社保公积金合计（工资凭证的"其他应付款"分录取此值）
    const socialDeduct = sumKeys(totals, ['insurance_personal', 'fund_personal', 'other_deduct'])
    if (socialDeduct) {
      f.push(field('social_deduct', '代扣社保公积金', round2(socialDeduct), sawTotalRow ? 1 : fallback))
    }

    // 凭证按应发工资入账；取不到应发时退回实发
    const bookable = totals.gross_amount ?? totals.net_amount
    if (bookable !== undefined) {
      f.push(field('total_amount', '应发工资合计', round2(bookable), sawTotalRow ? 1 : fallback))
    }

    if (!f.some((x) => x.key !== 'payroll_period')) {
      f.push(field('payroll_hint', '提示', '识别到工资表但未提取到金额列，请核对文件或改用 Excel 上传', 0.4))
    }
    return f
  },

  /** 工资条（单人、无表头）：按标签取值 */
  parsePayslip(ctx: ParseContext, out: ParsedField[], fallback: number) {
    const { lines, rawText } = ctx
    const name = takeLabelValue(lines, '姓名', fallback)
    if (name) out.push(field('name', '姓名', name.value, name.confidence))

    const labels: Array<[string, string]> = [
      ['应发工资', 'gross_amount'],
      ['实发工资', 'net_amount'],
      ['基本工资', 'base_salary'],
      ['绩效工资', 'performance'],
      ['个人社保', 'insurance_personal'],
      ['公积金', 'fund_personal'],
      ['个人所得税', 'income_tax'],
    ]
    for (const [label, key] of labels) {
      const got = takeLabelValue(lines, label, fallback)
      if (!got) continue
      const v = extractMoney(got.value)
      if (v !== null) out.push(field(key, label, v, got.confidence))
    }

    const gross = out.find((x) => x.key === 'gross_amount')?.value
    const net = out.find((x) => x.key === 'net_amount')?.value
    if (typeof gross === 'number') out.push(field('total_amount', '应发工资合计', gross, fallback))
    else if (typeof net === 'number') out.push(field('total_amount', '实发工资合计', net, fallback))

    // 代扣社保公积金合计：工资条也要补上，否则贷方缺一项导致借贷不平
    const social = pick(out, 'insurance_personal') ?? 0
    const socialTotal =
      social + (pick(out, 'fund_personal') ?? 0) + (pick(out, 'other_deduct') ?? 0)
    if (socialTotal > 0) {
      out.push(field('social_deduct', '代扣社保公积金', round2(socialTotal), fallback))
    }

    const date = extractDate(rawText)
    if (date) out.push(field('issue_date', '工资日期', date, fallback * 0.9))
    return out
  },
} as DocumentParser

function sumKeys(totals: Record<string, number>, keys: string[]): number | undefined {
  let sum = 0
  let any = false
  for (const k of keys) {
    if (typeof totals[k] === 'number') {
      sum += totals[k]
      any = true
    }
  }
  return any ? sum : undefined
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
