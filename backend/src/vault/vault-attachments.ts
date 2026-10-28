/**
 * 历史明文附件的就地加密（库首次转为密文后执行一次）。
 *
 * 幂等：已加密的文件跳过，中断后重跑即可；单个文件失败只记日志不中断。
 * 附件密钥来自内存中的 MK，因此调用前必须先 `setMasterKey()`。
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { encryptFileInPlace, isEncryptedFile } from './attachment-cipher'

/**
 * 加密 UPLOAD_DIR 下的历史明文附件。
 *
 * @returns 本次实际加密的文件数
 */
export async function encryptLegacyAttachments(
  log: (message: string) => void = () => undefined,
): Promise<number> {
  const raw = process.env.UPLOAD_DIR || 'data/uploads'
  const root = path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw)
  if (!fs.existsSync(root)) {
    log('[vault] 附件目录不存在，跳过历史附件加密')
    return 0
  }

  let count = 0
  const walk = async (dir: string): Promise<void> => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name)
      let st: fs.Stats
      try {
        st = await fs.promises.stat(p)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        await walk(p)
        continue
      }
      if (!st.isFile() || st.size === 0) continue
      try {
        if (await isEncryptedFile(p)) continue
        if (await encryptFileInPlace(p)) count++
      } catch (err) {
        log(`[vault] 附件加密失败（跳过）${p}：${(err as Error).message}`)
      }
    }
  }

  try {
    await walk(root)
  } catch (err) {
    log(`[vault] 历史附件加密中断：${(err as Error).message}`)
  }
  log(`[vault] 历史明文附件就地加密：${count} 个`)
  return count
}
