/** ETag 生成与 If-None-Match 匹配（索引快照按原始字节计算） */
import crypto from 'node:crypto'

export function etagFor(bytes) {
  const hash = crypto.createHash('sha256').update(bytes).digest('base64url').slice(0, 22)
  return `"${hash}"`
}

export function etagMatches(ifNoneMatch, etag) {
  if (!ifNoneMatch) return false
  const header = String(ifNoneMatch).trim()
  if (header === '*') return true
  return header
    .split(',')
    .map((item) => item.trim().replace(/^W\//, ''))
    .includes(etag)
}
