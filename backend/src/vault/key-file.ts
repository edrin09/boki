/**
 * 密钥文件 `vault.key` 的读写。
 *
 * 文件内容：32 字节随机主密钥（MK）的 64 位小写 hex 文本 + 换行。
 * 存放位置：程序根目录。
 * - 开发期（后端在 `backend/` 或 `resources/server` 下启动）：取上一级目录；
 * - 桌面壳会显式传 `VAULT_KEY_FILE`（安装根目录），不依赖这里的推断。
 *
 * ⚠️ 没有 `vault.key` 就没有 MK：加密库无法打开，系统也不会启动。
 *    因此本模块**只允许**在「库不存在 / 明文库 / 旧库转换」时生成新密钥，
 *    绝不因为密钥文件损坏或丢失就静默换一把新钥匙。
 */
import { randomBytes } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

export const VAULT_KEY_FILENAME = 'vault.key'

/** 密钥文件路径（`VAULT_KEY_FILE` 优先） */
export function vaultKeyFilePath(): string {
  const env = process.env.VAULT_KEY_FILE
  if (env) return path.isAbsolute(env) ? env : path.resolve(process.cwd(), env)

  const cwd = process.cwd()
  const base = path.basename(cwd).toLowerCase()
  // 直接从 backend / resources/server 启动时，程序根目录是上一级；
  // 桌面壳会显式传入绝对路径，不走这条推断。
  const root = base === 'backend' || base === 'server' ? path.dirname(cwd) : cwd
  return path.join(root, VAULT_KEY_FILENAME)
}

/**
 * 读取密钥文件。
 *
 * @returns 文件不存在返回 null；存在但内容非法则抛错（绝不覆盖）
 */
export function readVaultKeyFile(file: string = vaultKeyFilePath()): Buffer | null {
  if (!fs.existsSync(file)) return null
  const raw = fs.readFileSync(file, 'utf8').trim()
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(`密钥文件格式无效（应为 64 位 hex）：${file}`)
  }
  return Buffer.from(raw, 'hex')
}

/** 原子写入密钥文件（先写 .tmp 再 rename） */
export function writeVaultKeyFile(mk: Buffer, file: string = vaultKeyFilePath()): void {
  if (!Buffer.isBuffer(mk) || mk.length !== 32) {
    throw new Error('主密钥必须是 32 字节')
  }
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, `${mk.toString('hex')}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
}

/** 生成一把新密钥并落盘 */
export function generateVaultKeyFile(file: string = vaultKeyFilePath()): Buffer {
  const mk = randomBytes(32)
  writeVaultKeyFile(mk, file)
  return mk
}

/** 读取已有密钥；不存在则生成 */
export function ensureVaultKeyFile(file: string = vaultKeyFilePath()): {
  mk: Buffer
  created: boolean
  file: string
} {
  const existing = readVaultKeyFile(file)
  if (existing) return { mk: existing, created: false, file }
  return { mk: generateVaultKeyFile(file), created: true, file }
}
