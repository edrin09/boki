import type { Repository } from 'typeorm'

/** 各基础档案的编码前缀 */
export const CODE_PREFIX = {
  partner: 'C',
  department: 'D',
  project: 'P',
  employee: 'E',
  bank: 'B',
} as const

/**
 * 生成连续编码：前缀 + 序号（默认 4 位，如 D0001）。
 * 取同前缀已有编码的最大序号 +1，兼容历史不同位数的编码。
 */
export async function nextCode(
  repo: Repository<any>,
  prefix: string,
  width = 4,
  field = 'code',
): Promise<string> {
  const rows = await repo
    .createQueryBuilder('t')
    .select(`t.${field}`, 'code')
    .where(`t.${field} LIKE :prefix`, { prefix: `${prefix}%` })
    .getRawMany<{ code: string }>()

  let max = 0
  for (const row of rows) {
    const digits = String(row.code ?? '')
      .slice(prefix.length)
      .replace(/\D/g, '')
    const seq = parseInt(digits, 10)
    if (!Number.isNaN(seq) && seq > max) max = seq
  }

  return `${prefix}${String(max + 1).padStart(width, '0')}`
}