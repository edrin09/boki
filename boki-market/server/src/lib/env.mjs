/**
 * 环境变量文件加载（零依赖的最小 dotenv 实现）
 *
 * 之所以不引第三方依赖：市场服务端保持「零运行时第三方依赖」，
 * 部署时只需 Node 22 + 源码，npm ci 都可以省掉。
 */
import fs from 'node:fs'

/**
 * 解析 .env 文本，返回键值对象（不触碰 process.env）
 * 支持：注释、export 前缀、单/双引号、行尾 ` #` 注释
 */
export function parseEnv(text) {
  const out = {}
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const matched = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!matched) continue
    const key = matched[1]
    let value = matched[2]

    const quoted =
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    if (quoted) {
      const quote = value[0]
      value = value.slice(1, -1)
      if (quote === '"') value = value.replace(/\\n/g, '\n').replace(/\\"/g, '"')
    } else {
      const hash = value.indexOf(' #')
      if (hash >= 0) value = value.slice(0, hash)
      value = value.trim()
    }
    out[key] = value
  }
  return out
}

/**
 * 把 .env 读进目标对象（默认 process.env）。
 * 已存在且非空的变量优先，便于命令行 / systemd 覆盖文件配置。
 */
export function loadDotEnv(file, target = process.env) {
  if (!fs.existsSync(file)) return { loaded: false, keys: [] }
  const parsed = parseEnv(fs.readFileSync(file, 'utf8'))
  const keys = []
  for (const [key, value] of Object.entries(parsed)) {
    if (target[key] === undefined || target[key] === '') {
      target[key] = value
      keys.push(key)
    }
  }
  return { loaded: true, keys }
}
