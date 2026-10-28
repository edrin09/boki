/** HTTP 小工具：统一 JSON 响应、请求体读取与来源 IP 解析 */

export class HttpError extends Error {
  constructor(status, message, { code, headers, detail } = {}) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code ?? status
    this.headers = headers ?? {}
    this.detail = detail
  }
}

export function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
    ...headers,
  })
  res.end(payload)
}

export function sendEmpty(res, status, headers = {}) {
  res.writeHead(status, headers)
  res.end()
}

export async function readBodyBuffer(req, { limit = 64 * 1024 } = {}) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new HttpError(413, '请求体过大')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export async function readJsonBody(req, { limit = 64 * 1024 } = {}) {
  const raw = await readBodyBuffer(req, { limit })
  if (!raw.length) return {}
  try {
    return JSON.parse(raw.toString('utf8'))
  } catch {
    throw new HttpError(400, '请求体不是合法 JSON')
  }
}

export function isLoopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

/**
 * 客户端 IP：默认只看 socket；置于可信反向代理之后时取 X-Forwarded-For 最后一个
 * （nginx 的 $proxy_add_x_forwarded_for 会把真实客户端追加在末尾）。
 */
export function clientIp(req, { trustProxy = false } = {}) {
  if (trustProxy) {
    const forwarded = String(req.headers['x-forwarded-for'] || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    if (forwarded.length) return forwarded[forwarded.length - 1]
  }
  return req.socket?.remoteAddress || 'unknown'
}

export function isSecureRequest(req, { trustProxy = false } = {}) {
  if (req.socket?.encrypted) return true
  if (!trustProxy) return false
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase()
  return proto === 'https'
}
