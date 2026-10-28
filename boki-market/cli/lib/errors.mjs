/**
 * CLI 统一错误类型。
 *
 * exitCode 约定：
 *   2 = 用法 / 参数错误（打印用法提示，便于脚本区分）
 *   1 = 运行期错误（HTTP、网络、文件、密钥等）
 */
export class CliError extends Error {
  constructor(message, { exitCode = 1, detail, cause } = {}) {
    super(message, cause ? { cause } : undefined)
    this.name = 'CliError'
    this.exitCode = exitCode
    this.detail = detail
  }
}

export function usageError(message) {
  return new CliError(message, { exitCode: 2 })
}

/** 把服务端 JSON 错误整理成一行可读信息（保留 422 的 problems） */
export function formatApiError(status, payload, fallbackText = '') {
  const message = payload?.message || fallbackText || '请求失败'
  let text = `HTTP ${status}：${message}`
  const problems = payload?.problems || payload?.detail?.problems
  if (Array.isArray(problems) && problems.length) {
    const lines = problems
      .map((item) => {
        const target = item.pluginId || item.categoryId || '?'
        return `${target}（${item.reason || 'invalid'}）：${item.message || ''}`
      })
      .join('；')
    text += `\n  ${lines}`
  } else if (payload?.reason) {
    text += `（${payload.reason}）`
  }
  return text
}
