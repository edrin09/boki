/**
 * 最小 ZIP 读写实现（零第三方依赖）。
 *
 * 只覆盖发布需要的能力：UTF-8 文件名、store/deflate、无 ZIP64、无加密、无目录项。
 * 打包顺序固定（按路径排序），同一份源码可得到稳定内容；解压仅用于测试与自检。
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

export function crc32(buffer) {
  let crc = 0xffffffff
  for (let index = 0; index < buffer.length; index += 1) {
    crc = CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(input) {
  const date = input ? new Date(input) : new Date()
  const year = Math.min(Math.max(date.getUTCFullYear(), 1980), 2107)
  const time =
    (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2)
  const day = ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate()
  return { time, date: day }
}

function assertSafeName(name) {
  if (typeof name !== 'string' || !name) throw new Error('ZIP 条目名不能为空')
  if (name.includes('\\')) throw new Error(`ZIP 条目名必须使用 /：${name}`)
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) throw new Error(`ZIP 条目名不能是绝对路径：${name}`)
  const segments = name.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`ZIP 条目名包含非法路径段：${name}`)
  }
  const bytes = Buffer.byteLength(name, 'utf8')
  if (bytes > MAX_UINT16) throw new Error(`ZIP 条目名过长：${name}`)
}

/**
 * @param {{ name: string, data: Buffer|string, mtime?: number|Date, mode?: number }[]} entries
 * @returns {Buffer}
 */
export function createZip(entries) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('ZIP 至少需要一个条目')
  if (entries.length > MAX_UINT16) throw new Error('ZIP 条目数超过 65535，不支持 ZIP64')

  const sorted = [...entries].sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
  const seen = new Set()
  const localParts = []
  const centralParts = []
  let offset = 0

  for (const entry of sorted) {
    assertSafeName(entry.name)
    if (seen.has(entry.name)) throw new Error(`ZIP 条目重复：${entry.name}`)
    seen.add(entry.name)

    const name = Buffer.from(entry.name, 'utf8')
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), 'utf8')
    if (data.length > MAX_UINT32) throw new Error(`ZIP 条目过大：${entry.name}`)

    let method = 0
    let payload = data
    if (data.length > 0) {
      const deflated = zlib.deflateRawSync(data, { level: 9 })
      if (deflated.length < data.length) {
        method = 8
        payload = deflated
      }
    }

    const checksum = crc32(data)
    const { time, date } = dosDateTime(entry.mtime)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(LOCAL_SIGNATURE, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0x0800, 6) // UTF-8 文件名
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28) // extra

    localParts.push(local, name, payload)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(CENTRAL_SIGNATURE, 0)
    central.writeUInt16LE(0x031e, 4) // made by: UNIX + 3.0
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(date, 14)
    central.writeUInt32LE(checksum, 16)
    central.writeUInt32LE(payload.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30) // extra
    central.writeUInt16LE(0, 32) // comment
    central.writeUInt16LE(0, 34) // disk
    central.writeUInt16LE(0, 36) // internal attrs
    central.writeUInt32LE(((entry.mode ?? 0o644) << 16) >>> 0, 38)
    central.writeUInt32LE(offset, 42)

    centralParts.push(central, name)
    offset += local.length + name.length + payload.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  const localData = Buffer.concat(localParts)
  if (offset > MAX_UINT32) throw new Error('ZIP 超过 4GiB，不支持 ZIP64')

  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(EOCD_SIGNATURE, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(sorted.length, 8)
  eocd.writeUInt16LE(sorted.length, 10)
  eocd.writeUInt32LE(centralDirectory.length, 12)
  eocd.writeUInt32LE(localData.length, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([localData, centralDirectory, eocd])
}

function findEocd(buffer) {
  const min = Math.max(0, buffer.length - (MAX_UINT16 + 22))
  for (let offset = buffer.length - 22; offset >= min; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      const commentLength = buffer.readUInt16LE(offset + 20)
      if (offset + 22 + commentLength === buffer.length) return offset
    }
  }
  throw new Error('不是合法的 ZIP：找不到 EOCD')
}

/**
 * 读取 ZIP 全部条目（用于测试 / 发布前自检）。
 * @param {Buffer} buffer
 * @returns {Map<string, Buffer>}
 */
export function readZip(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw new Error('不是合法的 ZIP：内容过短')
  const eocd = findEocd(buffer)

  const count = buffer.readUInt16LE(eocd + 10)
  const centralSize = buffer.readUInt32LE(eocd + 12)
  const centralOffset = buffer.readUInt32LE(eocd + 16)
  if (count === MAX_UINT16 || centralOffset === MAX_UINT32 || centralSize === MAX_UINT32) {
    throw new Error('不支持 ZIP64')
  }
  if (centralOffset + centralSize > buffer.length) throw new Error('ZIP 中央目录越界')

  const entries = new Map()
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

    let data
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
