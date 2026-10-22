/**
 * 附件加密（AES-256-GCM，流式）。
 *
 * 库加密由 SQLCipher 负责，但 `data/uploads/**` 下的发票 PDF / 图片是独立文件，
 * SQLCipher 管不到，必须单独加密。
 *
 * 文件格式：
 * ```text
 * ┌────────┬──────────┬───────────────┬──────────┐
 * │ BOKI1  │ iv(12B)  │ 密文(变长)     │ tag(16B) │
 * │ 5B     │          │               │          │
 * └────────┴──────────┴───────────────┴──────────┘
 * ```
 *
 * ⚠️ tag 放在**末尾**而不是方案里的头部：GCM 的认证标签依赖全部密文，
 * 流式写入时只有算完才拿得到，放头部就必须把整个文件读进内存（与「流式处理」
 * 的目标冲突）。读取时按 magic 判定是否密文，历史明文附件照常可读，
 * 因此可以平滑升级、无需强制迁移。
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { getAttachmentKey } from './keystore'

/** 文件魔数 */
export const ATTACHMENT_MAGIC = 'BOKI1'
/** 魔数长度（字节） */
export const MAGIC_LENGTH = 5
/** 初始化向量长度（字节） */
export const IV_LENGTH = 12
/** 认证标签长度（字节） */
export const TAG_LENGTH = 16

/** 附件是否已启用加密（内核已解锁且有附件密钥） */
export function isAttachmentEncryptionActive(): boolean {
  return !!getAttachmentKey()
}

/**
 * 判断内容是否已加密（按 magic 判定）。
 *
 * 兼容历史明文附件：magic 不匹配就按明文处理。
 */
export function looksEncrypted(buf: Buffer): boolean {
  return buf.length >= MAGIC_LENGTH && buf.subarray(0, MAGIC_LENGTH).toString('latin1') === ATTACHMENT_MAGIC
}

/** 判断文件是否已加密 */
export async function isEncryptedFile(file: string): Promise<boolean> {
  if (!existsSync(file)) return false
  const handle = await fs.open(file, 'r')
  try {
    const buf = Buffer.alloc(MAGIC_LENGTH)
    const { bytesRead } = await handle.read(buf, 0, MAGIC_LENGTH, 0)
    return bytesRead === MAGIC_LENGTH && looksEncrypted(buf)
  } finally {
    await handle.close()
  }
}

/**
 * 加密写入文件（覆盖写）。
 *
 * 未启用加密时按明文写（兼容未加密部署）。
 */
export async function encryptFile(source: string, target: string): Promise<void> {
  const key = getAttachmentKey()
  if (!key) {
    await fs.copyFile(source, target)
    return
  }
  await fs.mkdir(path.dirname(target), { recursive: true })
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const out = createWriteStream(target)
  out.write(Buffer.from(ATTACHMENT_MAGIC, 'latin1'))
  out.write(iv)
  await pipeline(createReadStream(source), cipher, out, { end: true })
  // pipeline 已结束流，单独追加 tag
  await fs.appendFile(target, cipher.getAuthTag())
}

/**
 * 解密到目标文件。
 *
 * 源文件不是密文时直接复制（历史明文附件）。
 */
export async function decryptFile(source: string, target: string): Promise<void> {
  if (!(await isEncryptedFile(source))) {
    await fs.copyFile(source, target)
    return
  }
  const key = getAttachmentKey()
  if (!key) throw new Error('附件已加密，但当前未解锁，无法读取')

  const stat = await fs.stat(source)
  const handle = await fs.open(source, 'r')
  try {
    const ivBuf = Buffer.alloc(IV_LENGTH)
    await handle.read(ivBuf, 0, IV_LENGTH, MAGIC_LENGTH)
    const tagBuf = Buffer.alloc(TAG_LENGTH)
    await handle.read(tagBuf, 0, TAG_LENGTH, stat.size - TAG_LENGTH)

    const decipher = createDecipheriv('aes-256-gcm', key, ivBuf)
    decipher.setAuthTag(tagBuf)

    const out = createWriteStream(target)
    const body = createReadStream(source, {
      start: MAGIC_LENGTH + IV_LENGTH,
      end: stat.size - TAG_LENGTH - 1,
    })
    await pipeline(body, decipher, out, { end: true })
  } finally {
    await handle.close()
  }
}

/**
 * 写附件（按需加密）。
 *
 * @param filePath 目标路径
 * @param data 文件内容
 */
export async function writeAttachment(filePath: string, data: Buffer): Promise<void> {
  const key = getAttachmentKey()
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  if (!key) {
    await fs.writeFile(filePath, data)
    return
  }
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()])
  const header = Buffer.concat([Buffer.from(ATTACHMENT_MAGIC, 'latin1'), iv])
  const tag = cipher.getAuthTag()
  await fs.writeFile(filePath, Buffer.concat([header, ciphertext, tag]))
}

/**
 * 读附件（自动识别密文 / 明文）。
 *
 * 插件（ocr / receipts 等）**必须**走这个接口，不能直接 `fs.readFile`。
 */
export async function readAttachment(filePath: string): Promise<Buffer> {
  const buf = await fs.readFile(filePath)
  if (!looksEncrypted(buf)) return buf
  const key = getAttachmentKey()
  if (!key) throw new Error('附件已加密，但当前未解锁，无法读取')
  const iv = buf.subarray(MAGIC_LENGTH, MAGIC_LENGTH + IV_LENGTH)
  const tag = buf.subarray(buf.length - TAG_LENGTH)
  const body = buf.subarray(MAGIC_LENGTH + IV_LENGTH, buf.length - TAG_LENGTH)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(body), decipher.final()])
}

/**
 * 以流的方式读附件（自动解密），用于下载 / 大文件处理。
 */
export function createAttachmentReadStream(filePath: string): NodeJS.ReadableStream {
  // 同步判断 magic：先读前 5 字节
  const fd = require('node:fs').openSync(filePath, 'r')
  const head = Buffer.alloc(MAGIC_LENGTH)
  try {
    require('node:fs').readSync(fd, head, 0, MAGIC_LENGTH, 0)
  } finally {
    require('node:fs').closeSync(fd)
  }
  if (!looksEncrypted(head)) return createReadStream(filePath)

  const key = getAttachmentKey()
  if (!key) throw new Error('附件已加密，但当前未解锁，无法读取')
  const stat = require('node:fs').statSync(filePath)
  const iv = Buffer.alloc(IV_LENGTH)
  const fd2 = require('node:fs').openSync(filePath, 'r')
  try {
    require('node:fs').readSync(fd2, iv, 0, IV_LENGTH, MAGIC_LENGTH)
  } finally {
    require('node:fs').closeSync(fd2)
  }
  const tag = Buffer.alloc(TAG_LENGTH)
  const fd3 = require('node:fs').openSync(filePath, 'r')
  try {
    require('node:fs').readSync(fd3, tag, 0, TAG_LENGTH, stat.size - TAG_LENGTH)
  } finally {
    require('node:fs').closeSync(fd3)
  }
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const body = createReadStream(filePath, {
    start: MAGIC_LENGTH + IV_LENGTH,
    end: stat.size - TAG_LENGTH - 1,
  })
  return body.pipe(decipher)
}

/**
 * 就地把明文附件加密（历史附件批量迁移用）。
 *
 * 幂等：已加密的文件直接跳过。
 *
 * @returns 是否发生了加密
 */
export async function encryptFileInPlace(filePath: string): Promise<boolean> {
  if (await isEncryptedFile(filePath)) return false
  const key = getAttachmentKey()
  if (!key) throw new Error('附件加密未启用')
  const tmp = `${filePath}.enc-tmp`
  await encryptFile(filePath, tmp)
  await fs.rename(tmp, filePath)
  return true
}
