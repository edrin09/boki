/**
 * 零依赖参数解析：`--flag value`、`--flag=value`、布尔开关。
 *
 * 每个命令显式声明允许的选项，拼错时直接报用法错误，而不是静默忽略。
 */
import { usageError } from './errors.mjs'

/**
 * @param {string[]} argv
 * @param {{ booleans?: string[], strings?: string[] }} spec
 * @returns {{ flags: Record<string, string|boolean>, positionals: string[] }}
 */
export function parseArgs(argv, { booleans = [], strings = [] } = {}) {
  const boolSet = new Set(booleans)
  const stringSet = new Set(strings)
  const flags = {}
  const positionals = []

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--') {
      positionals.push(...argv.slice(index + 1))
      break
    }
    if (!arg.startsWith('--')) {
      if (arg.startsWith('-') && arg !== '-') {
        throw usageError(`未知选项：${arg}（--help 查看可用选项）`)
      }
      positionals.push(arg)
      continue
    }

    const body = arg.slice(2)
    if (!body) throw usageError('空选项 `--` 后应直接跟位置参数')

    const eq = body.indexOf('=')
    const name = eq === -1 ? body : body.slice(0, eq)
    const inline = eq === -1 ? undefined : body.slice(eq + 1)

    if (boolSet.has(name)) {
      if (inline === undefined) {
        flags[name] = true
      } else if (['true', '1', 'yes', 'on'].includes(inline.toLowerCase())) {
        flags[name] = true
      } else if (['false', '0', 'no', 'off'].includes(inline.toLowerCase())) {
        flags[name] = false
      } else {
        throw usageError(`--${name} 只接受 true/false，当前为 ${JSON.stringify(inline)}`)
      }
      continue
    }

    if (stringSet.has(name)) {
      const value = inline === undefined ? argv[index + 1] : inline
      if (value === undefined || (inline === undefined && value.startsWith('--'))) {
        throw usageError(`--${name} 需要一个值`)
      }
      flags[name] = value
      if (inline === undefined) index += 1
      continue
    }

    throw usageError(`未知选项：--${name}（--help 查看可用选项）`)
  }

  return { flags, positionals }
}

/** 取字符串选项；空字符串视为未提供 */
export function str(flags, name) {
  const value = flags[name]
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

export function bool(flags, name) {
  return flags[name] === true
}
