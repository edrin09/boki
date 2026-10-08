/**
 * 编码生成所需的最小仓储能力。
 * 兼容 TypeORM Repository 与公司隔离仓储（两者都提供 createQueryBuilder）。
 */
export interface CodeSource {
  createQueryBuilder(alias: string): {
    select(selection: string, alias?: string): any
    where(condition: string, parameters?: Record<string, any>): any
    getRawMany(): Promise<Record<string, any>[]>
  }
}

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
  repo: CodeSource,
  prefix: string,
  width = 4,
  field = 'code',
): Promise<string> {
  const codeField = field
  const rows = await repo
    .createQueryBuilder('t')
    .select(`t.${field}`, codeField)
    .where(`t.${field} LIKE :prefix`, { prefix: `${prefix}%` })
    .getRawMany()

  let max = 0
  for (const row of rows) {
    const digits = String(row[codeField] ?? '')
      .slice(prefix.length)
      .replace(/\D/g, '')
    const seq = parseInt(digits, 10)
    if (!Number.isNaN(seq) && seq > max) max = seq
  }

  return `${prefix}${String(max + 1).padStart(width, '0')}`
}