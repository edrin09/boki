import { Transform } from 'class-transformer'

/**
 * 将查询参数转换为数组：
 * - 已是数组则原样返回
 * - 单个字符串按逗号分隔拆分（便于前端只传一个 ID）
 */
export const ToArray = () =>
  Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined
    if (Array.isArray(value)) return value
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    }
    return [value]
  })