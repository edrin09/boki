import dayjs from 'dayjs'

/** 日期 -> 会计期间 YYYYMM（number，如 202603） */
export function toPeriod(date: string | Date): number {
  const d = dayjs(date)
  if (!d.isValid()) return 0
  return Number(d.format('YYYYMM'))
}

/** 会计期间 -> 起止日期（闭区间） */
export function periodToRange(
  period: number,
): { startDate: string; endDate: string } {
  const y = Math.floor(period / 100)
  const m = period % 100
  const start = dayjs(`${y}-${String(m).padStart(2, '0')}-01`)
  const end = start.endOf('month')
  return {
    startDate: start.format('YYYY-MM-DD'),
    endDate: end.format('YYYY-MM-DD'),
  }
}

/** 期间加减 */
export function addPeriod(period: number, offset: number): number {
  const y = Math.floor(period / 100)
  const m = period % 100
  const d = dayjs(`${y}-${String(m).padStart(2, '0')}-01`).add(offset, 'month')
  return Number(d.format('YYYYMM'))
}

/** 期间起始日期 */
export function periodStartDate(period: number): string {
  const y = Math.floor(period / 100)
  const m = period % 100
  return dayjs(`${y}-${String(m).padStart(2, '0')}-01`).format('YYYY-MM-DD')
}

/** 期间结束日期 */
export function periodEndDate(period: number): string {
  const y = Math.floor(period / 100)
  const m = period % 100
  return dayjs(`${y}-${String(m).padStart(2, '0')}-01`)
    .endOf('month')
    .format('YYYY-MM-DD')
}

/** 期间 -> 年初日期（上一年 12-31 之后，即本年 01-01） */
export function yearStartDate(period: number): string {
  const y = Math.floor(period / 100)
  return `${y}-01-01`
}

/** 期间 -> 所属年度 */
export function periodToYear(period: number): number {
  return Math.floor(period / 100)
}

/** 生成期间序列（含起止） */
export function periodRange(startPeriod: number, endPeriod: number): number[] {
  const result: number[] = []
  let p = startPeriod
  while (p <= endPeriod) {
    result.push(p)
    p = addPeriod(p, 1)
  }
  return result
}

/** 格式化日期为 YYYY-MM-DD */
export function formatDate(date: string | Date | null | undefined): string | null {
  if (!date) return null
  const d = dayjs(date)
  return d.isValid() ? d.format('YYYY-MM-DD') : null
}

/** 格式化日期时间为 YYYY-MM-DD HH:mm:ss */
export function formatDateTime(date: string | Date | null | undefined): string | null {
  if (!date) return null
  const d = dayjs(date)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : null
}

/** 今天的 YYYY-MM-DD */
export function today(): string {
  return dayjs().format('YYYY-MM-DD')
}

/** 当前期间 */
export function currentPeriod(): number {
  return toPeriod(new Date())
}

/**
 * 校验日期是否在期间内
 */
export function isDateInPeriod(date: string | Date, period: number): boolean {
  const d = dayjs(date).format('YYYY-MM-DD')
  return d >= periodStartDate(period) && d <= periodEndDate(period)
}