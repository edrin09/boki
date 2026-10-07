/**
 * 金额计算工具
 * 内部统一以「分」为最小单位做整数运算，避免浮点误差导致账不平。
 */

/** 元 -> 分（四舍五入） */
export function toCents(amount: number | string | null | undefined): number {
  if (amount === null || amount === undefined || amount === '') return 0
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (!Number.isFinite(num)) return 0
  return Math.round(num * 100)
}

/** 分 -> 元 */
export function fromCents(cents: number): number {
  return Math.round(cents) / 100
}

/** 金额保留两位小数（四舍五入到分） */
export function round2(amount: number): number {
  return fromCents(toCents(amount))
}

/** 金额求和 */
export function sumAmounts(list: Array<number | string | null | undefined>): number {
  return fromCents(list.reduce<number>((acc, item) => acc + toCents(item), 0))
}

/** 是否为零（分） */
export function isZeroAmount(amount: number | string | null | undefined): boolean {
  return toCents(amount) === 0
}

/** 是否为正数（分 > 0） */
export function isPositiveAmount(amount: number | string | null | undefined): boolean {
  return toCents(amount) > 0
}

/** 是否为负数（分 < 0） */
export function isNegativeAmount(amount: number | string | null | undefined): boolean {
  return toCents(amount) < 0
}

/**
 * 安全相加（返回分，避免精度问题）
 */
export function addCents(...amounts: Array<number | string | null | undefined>): number {
  return amounts.reduce<number>((acc, item) => acc + toCents(item), 0)
}

/** 转为可用于金额展示的字符串（保留两位） */
export function toAmountString(amount: number): string {
  return fromCents(toCents(amount)).toFixed(2)
}