import { randomUUID } from 'node:crypto'

/**
 * 导出结果内存缓存：语音查询生成 Excel 后暂存，前端凭 exportId 下载。
 *
 * 简单内存实现（重启丢失）；TTL 10 分钟，超时自动清理。
 * 前端下载失败时提示重新提问即可，不做持久化。
 */
interface ExportEntry {
  id: string
  filename: string
  buffer: Buffer
  createdAt: number
}

const TTL_MS = 10 * 60 * 1000

const store = new Map<string, ExportEntry>()

/** 顺手 GC：写入与读取时清理过期项即可，量小无需定时器 */
function sweep(): void {
  const now = Date.now()
  for (const [id, entry] of store) {
    if (now - entry.createdAt > TTL_MS) store.delete(id)
  }
}

export function saveExport(buffer: Buffer, filename: string): { exportId: string; filename: string } {
  sweep()
  const id = randomUUID()
  store.set(id, { id, filename, buffer, createdAt: Date.now() })
  return { exportId: id, filename }
}

export function getExport(id: string): { buffer: Buffer; filename: string } | null {
  sweep()
  const entry = store.get(id)
  if (!entry) return null
  return { buffer: entry.buffer, filename: entry.filename }
}
