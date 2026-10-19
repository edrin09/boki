import type { Response } from 'express'
import archiver from 'archiver'

/** ZIP 内的单个文件 */
export interface ZipEntry {
  name: string
  buffer: Buffer
}

/**
 * 将多个内存 buffer 打包为 ZIP。
 * 文件名含中文时 archiver 自动设置 UTF-8 标志位（Windows 资源管理器 / 主流解压工具均可正确显示）。
 */
export function zipEntries(entries: ZipEntry[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 6 } })
    const chunks: Buffer[] = []
    archive.on('error', reject)
    archive.on('warning', (err) => {
      if ((err as any)?.code !== 'ENOENT') reject(err)
    })
    archive.on('data', (c: Buffer) => chunks.push(c))
    archive.on('end', () => resolve(Buffer.concat(chunks)))
    for (const e of entries) {
      archive.append(e.buffer, { name: e.name })
    }
    void archive.finalize()
  })
}

/** 以附件形式响应 ZIP 下载（filename 走 RFC 5987 支持中文） */
export function sendZipResponse(res: Response, buffer: Buffer, filename: string) {
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="export.zip"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  )
  res.send(buffer)
}
