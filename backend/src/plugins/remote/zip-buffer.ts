/**
 * 最小 ZIP 读取实现（零第三方依赖，移植自 boki-market/cli/lib/zip.mjs）。
 *
 * 只覆盖远程插件包解压需要的能力：UTF-8 文件名、store/deflate、无 ZIP64、无加密。
 * 解压前先校验 zip 的 sha256（由 RemoteMarketService 完成，这里只负责安全解包）。
 */
import zlib from 'node:zlib'

const LOCAL_SIGNATURE = 0x04034b50
const CENTRAL_SIGNATURE = 0x02014b50
const EOCD_SIGNATURE = 0x06054b50
const MAX_UINT16 = 0xffff
const MAX_UINT32 = 0xffffffff

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

export function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (let index = 0; index < buffer.length; index += 1) {
    crc = (CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8)) >>> 0
  }
  return (crc ^ 0xffffffff) >>> 0
}

function findEocd(buffer: Buffer): number {
  const min = Math.max(0, buffer.length - (MAX_UINT16 + 22))
  for (let offset = buffer.length - 22; offset >= min; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      const commentLength = buffer.readUInt16LE(offset + 20)
      if (offset + 22 + commentLength === buffer.length) return offset
    }
  }
  throw new Error('不是合法的 ZIP：找不到 EOCD')
}

/** 读取 ZIP 全部条目（目录项被写包工具展开成文件条目，此处天然忽略 path 结尾为 / 的条目） */
export function readZip(buffer: Buffer): Map<string, Buffer> {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw new Error('不是合法的 ZIP：内容过短')
  const eocd = findEocd(buffer)

  const count = buffer.readUInt16LE(eocd + 10)
  const centralSize = buffer.readUInt32LE(eocd + 12)
  const centralOffset = buffer.readUInt32LE(eocd + 16)
  if (count === MAX_UINT16 || centralOffset === MAX_UINT32 || centralSize === MAX_UINT32) {
    throw new Error('不支持 ZIP64')
  }
  if (centralOffset + centralSize > buffer.length) throw new Error('ZIP 中央目录越界')

  const entries = new Map<string, Buffer>()
  let offset = centralOffset
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) throw new Error('ZIP 中央目录损坏')
    const method = buffer.readUInt16LE(offset + 10)
    const checksum = buffer.readUInt32LE(offset + 16)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const size = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)

    if (buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) throw new Error(`ZIP 条目头损坏：${name}`)
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const payload = buffer.subarray(dataStart, dataStart + compressedSize)
    if (payload.length !== compressedSize) throw new Error(`ZIP 条目数据越界：${name}`)

    let data: Buffer
    if (method === 0) data = Buffer.from(payload)
    else if (method === 8) data = zlib.inflateRawSync(payload)
    else throw new Error(`不支持的 ZIP 压缩方法 ${method}：${name}`)
    if (data.length !== size) throw new Error(`ZIP 条目大小不符：${name}`)
    if (crc32(data) !== checksum) throw new Error(`ZIP 条目 CRC 校验失败：${name}`)
    if (entries.has(name)) throw new Error(`ZIP 条目重复：${name}`)
    entries.set(name, data)

    offset += 46 + nameLength + extraLength + commentLength
  }

  if (offset !== centralOffset + centralSize) throw new Error('ZIP 中央目录长度不符')
  return entries
}

/** ZIP 条目名安全校验（拒绝绝对路径 / 路径穿越） */
export function assertSafeEntryName(name: string): void {
  if (!name) throw new Error('ZIP 条目名不能为空')
  if (name.includes('\\') || name.startsWith('/') || /^[A-Za-z]:/.test(name)) {
    throw new Error(`ZIP 条目名非法：${name}`)
  }
  const segments = name.split('/')
  if (segments.some((seg) => seg !== '..' && seg === '')) {
    throw new Error(`ZIP 条目名包含空段：${name}`)
  }
  if (segments.some((seg) => seg === '..')) {
    throw new Error(`ZIP 条目名包含路径穿越：${name}`)
  }
}
