import { ValueTransformer } from 'typeorm'

/**
 * 金额字段转换器：数据库使用 decimal(18,2)，应用层统一使用 number。
 * 注意：SQLite 的 decimal 由 TypeORM 映射为 numeric，最终以字符串返回，统一转成 number。
 */
export const decimalTransformer: ValueTransformer = {
  to: (value?: number | string | null): number | undefined => {
    // 未提供该字段时交由数据库默认值处理，避免写入 NULL 触发 NOT NULL 约束
    if (value === undefined) return undefined
    if (value === null || value === '') return 0
    const num = typeof value === 'string' ? parseFloat(value) : value
    return Number.isFinite(num) ? Math.round(num * 100) / 100 : 0
  },
  from: (value?: string | number | null): number => {
    if (value === null || value === undefined || value === '') return 0
    const num = typeof value === 'string' ? parseFloat(value) : value
    return Number.isFinite(num) ? Math.round(num * 100) / 100 : 0
  },
}