/** 输出约定：人类可读走 stdout，进度走 stderr（保证 --json 时 stdout 只有 JSON） */
import { CliError } from './errors.mjs'

export function createOutput({ json = false } = {}) {
  return {
    json,
    /** 进度 / 步骤：--json 时写 stderr，避免污染机器可读输出 */
    step(message) {
      const stream = json ? process.stderr : process.stdout
      stream.write(`${message}\n`)
    },
    warn(message) {
      process.stderr.write(`警告：${message}\n`)
    },
    /** 最终结果：--json 输出单行 JSON；否则人类可读 */
    result(payload, human) {
      if (json) {
        process.stdout.write(`${JSON.stringify(payload)}\n`)
        return
      }
      if (typeof human === 'function') {
        const text = human(payload)
        if (text) process.stdout.write(`${text}\n`)
        return
      }
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
    },
  }
}

export function shortHash(value, length = 12) {
  const text = String(value ?? '')
  return text.length > length ? `${text.slice(0, length)}…` : text
}

export function formatBytes(bytes) {
  const value = Number(bytes ?? 0)
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`
}

/** 把私钥从任何错误信息中抹掉（防御性：日志永远不应带私钥） */
export function redact(message, secret) {
  const text = String(message ?? '')
  if (!secret) return text
  return text.split(secret).join('[redacted]')
}

export function fail(error, { secret } = {}) {
  if (error instanceof CliError) {
    process.stderr.write(`${redact(error.message, secret)}\n`)
    process.exitCode = error.exitCode
    return
  }
  process.stderr.write(`${redact(error?.message || String(error), secret)}\n`)
  if (process.env.MARKETCTL_DEBUG === '1' && error?.stack) {
    process.stderr.write(`${redact(error.stack, secret)}\n`)
  }
  process.exitCode = 1
}
