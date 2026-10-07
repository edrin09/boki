import dayjs from 'dayjs'

/** 金额格式化：千分位 + 两位小数 */
export function formatAmount(value: number | string | null | undefined): string {
  const num = Number(value ?? 0)
  if (!Number.isFinite(num)) return '0.00'
  return num.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** 金额转中文大写 */
export function toChineseAmount(value: number): string {
  const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
  const units = ['', '拾', '佰', '仟']
  const bigUnits = ['', '万', '亿', '万亿']

  if (!Number.isFinite(value)) return ''
  if (value === 0) return '零元整'

  const negative = value < 0
  const abs = Math.abs(value)

  const intPart = Math.floor(abs)
  const decimalPart = Math.round((abs - intPart) * 100)

  let intText = ''
  if (intPart === 0) {
    intText = '零'
  } else {
    const groups: number[] = []
    let n = intPart
    while (n > 0) {
      groups.push(n % 10000)
      n = Math.floor(n / 10000)
    }
    groups.forEach((group, gi) => {
      if (group === 0) {
        intText += bigUnits[gi]
        return
      }
      let groupText = ''
      let zeroPending = false
      const str = String(group).padStart(4, '0')
      for (let i = 0; i < 4; i++) {
        const d = Number(str[i])
        if (d === 0) {
          zeroPending = true
        } else {
          if (zeroPending && groupText) groupText += '零'
          zeroPending = false
          groupText += digits[d] + units[3 - i]
        }
      }
      intText += groupText + bigUnits[gi]
    })
  }

  let result = `${negative ? '负' : ''}${intText}元`

  if (decimalPart === 0) {
    result += '整'
  } else {
    const jiao = Math.floor(decimalPart / 10)
    const fen = decimalPart % 10
    if (jiao > 0) result += `${digits[jiao]}角`
    else if (fen > 0) result += '零'
    if (fen > 0) result += `${digits[fen]}分`
    else if (jiao === 0) result += '整'
  }

  return result
}

/** 日期格式化 */
export function formatDate(value: string | Date | null | undefined, pattern = 'YYYY-MM-DD'): string {
  if (!value) return ''
  const d = dayjs(value)
  return d.isValid() ? d.format(pattern) : ''
}

/** 日期时间格式化 */
export function formatDateTime(value: string | Date | null | undefined): string {
  return formatDate(value, 'YYYY-MM-DD HH:mm:ss')
}

/** 会计期间 YYYYMM <-> 年月 */
export function periodToYearMonth(period: number | null | undefined): [number, number] {
  const p = Number(period ?? 0)
  if (!p) {
    const now = dayjs()
    return [now.year(), now.month() + 1]
  }
  return [Math.floor(p / 100), p % 100]
}

export function yearMonthToPeriod(year: number, month: number): number {
  return Number(`${year}${String(month).padStart(2, '0')}`)
}

/** 当前会计期间 */
export function currentPeriod(): number {
  return yearMonthToPeriod(dayjs().year(), dayjs().month() + 1)
}

/** 期间加减 */
export function shiftPeriod(period: number, offset: number): number {
  const [year, month] = addMonths(periodToYearMonth(period), offset)
  return yearMonthToPeriod(year, month)
}

function addMonths([year, month]: [number, number], offset: number): [number, number] {
  const total = year * 12 + (month - 1) + offset
  return [Math.floor(total / 12), (total % 12) + 1]
}

/** 期间显示文案 */
export function periodLabel(period: number | null | undefined): string {
  const [y, m] = periodToYearMonth(period)
  return `${y} 年 ${m} 月`
}

/** 凭证字选项 */
export const VOUCHER_WORDS = [
  { label: '记账凭证', value: '记' },
  { label: '现金凭证', value: '现' },
  { label: '银行凭证', value: '银' },
  { label: '转账凭证', value: '转' },
]

/** 凭证状态文案与颜色 */
export function voucherStatusMeta(status: string): { label: string; type: 'info' | 'success' | 'danger' | 'warning' } {
  switch (status) {
    case 'approved':
      return { label: '已审核', type: 'success' }
    case 'cancelled':
      return { label: '已作废', type: 'danger' }
    case 'draft':
      return { label: '未审核', type: 'warning' }
    default:
      return { label: status, type: 'info' }
  }
}

/** 科目类别文案 */
export const CATEGORY_LABELS: Record<string, string> = {
  asset: '资产',
  liability: '负债',
  equity: '所有者权益',
  cost: '成本',
  profit: '损益',
}

export const CATEGORY_TAG_TYPE: Record<string, 'success' | 'warning' | 'primary' | 'info' | 'danger'> =
  {
    asset: 'primary',
    liability: 'warning',
    equity: 'success',
    cost: 'info',
    profit: 'danger',
  }

/** 借贷方向文案 */
export function directionLabel(direction: string | null | undefined): string {
  return direction === 'debit' ? '借' : '贷'
}