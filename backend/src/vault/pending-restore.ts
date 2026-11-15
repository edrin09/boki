/**
 * 「待生效的数据库恢复」。
 *
 * ⚠️ 为什么不能在服务运行期直接覆盖主库：
 *
 * WAL 模式下 SQLite 会在库文件旁留 `-wal` / `-shm`。运行中的连接换不掉，
 * 所以旧日志只能留在盘上；一旦主库文件被新文件替换，SQLite 会拿**旧日志**
 * 去套**新文件**（salt / 页尺寸对不上），直接报
 *
 *   SqliteError: file is not a database
 *   SqliteError: database disk image is malformed
 *
 * 而且后续每条查询都会失败 —— 整个应用等于当场报废（2026-11-14 线上踩过）。
 *
 * 正确姿势只有一条：**没有连接时换文件**。运行时只把待恢复的文件暂存到主库
 * 同目录，重启时在 TypeORM 建连之前（`applyPendingRestore`）原子替换。
 *
 * 好处：
 * - 恢复期间当前库完全不动，失败也不影响正在用的数据；
 * - 重启后才生效，与界面「请重启服务」的提示一致；
 * - 替换时顺手清掉旧 `-wal` / `-shm`，不会再出现「日志串库」。
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { resolveDatabasePath } from '../config/database.config'

const PLAN_FILENAME = '.restore-pending.json'
const STAGED_SUFFIX = '.restore-pending.db'

/** 待生效恢复的计划文件内容 */
export interface PendingRestorePlan {
  /** 暂存文件名（与主库同目录） */
  staged: string
  /** 来源描述（备份文件名 / 上传文件名），仅用于日志与提示 */
  sourceName: string
  /** 暂存时间（ISO） */
  createdAt: string
  /** 暂存文件形态：目前恒为 `cipher`（与当前 vault.key 一致） */
  format: 'cipher' | 'plain'
}

/** 计划文件路径 */
export function pendingRestorePlanPath(): string {
  return path.join(path.dirname(resolveDatabasePath()), PLAN_FILENAME)
}

/** 暂存库路径（主库同目录，保证 rename 是原子操作） */
export function pendingRestoreStagedPath(): string {
  return `${resolveDatabasePath()}${STAGED_SUFFIX}`
}

/** 读取计划文件；不存在或损坏返回 null */
export function readPendingRestore(): PendingRestorePlan | null {
  const file = pendingRestorePlanPath()
  if (!fs.existsSync(file)) return null
  try {
    const plan = JSON.parse(fs.readFileSync(file, 'utf8')) as PendingRestorePlan
    return plan && plan.staged ? plan : null
  } catch {
    return null
  }
}

/**
 * 暂存一份待恢复的库（运行期调用），**不动主库**。
 *
 * @param source 已完成校验、与当前密钥一致的库文件
 * @param sourceName 来源描述，写进日志与前端提示
 */
export function stagePendingRestore(source: string, sourceName: string): PendingRestorePlan {
  const staged = pendingRestoreStagedPath()
  fs.mkdirSync(path.dirname(staged), { recursive: true })
  // 覆盖式复制：上一次的暂存直接被新的顶掉
  fs.copyFileSync(source, staged)
  const plan: PendingRestorePlan = {
    staged: path.basename(staged),
    sourceName,
    createdAt: new Date().toISOString(),
    format: 'cipher',
  }
  writePendingRestorePlan(plan)
  return plan
}

/**
 * 应用待生效恢复（**只能在 TypeORM 建连之前调用**，即 `main.ts` 启动早期）。
 *
 * @returns 是否真的替换了主库
 */
export function applyPendingRestore(log?: (message: string) => void): boolean {
  const plan = readPendingRestore()
  if (!plan) return false

  const dbPath = resolveDatabasePath()
  const staged = pendingRestoreStagedPath()
  const info = (m: string) => log?.(m)

  if (!fs.existsSync(staged)) {
    fs.rmSync(pendingRestorePlanPath(), { force: true })
    info('待生效恢复缺少暂存文件，已忽略（主库未改动）')
    return false
  }

  // 无连接状态下清掉旧日志：否则新库会被旧 -wal 拖成 malformed
  for (const sidecar of [`${dbPath}-wal`, `${dbPath}-shm`]) {
    fs.rmSync(sidecar, { force: true })
  }

  try {
    fs.renameSync(staged, dbPath)
  } catch {
    // 极端情况（跨设备 / 句柄未释放）：退回复制 + 删除
    fs.copyFileSync(staged, dbPath)
    fs.rmSync(staged, { force: true })
  }

  fs.rmSync(pendingRestorePlanPath(), { force: true })
  for (const sidecar of [`${dbPath}-wal`, `${dbPath}-shm`]) {
    fs.rmSync(sidecar, { force: true })
  }
  info(`已应用待生效恢复：${plan.sourceName} → ${path.basename(dbPath)}（原暂存于 ${plan.createdAt}）`)
  return true
}

/** 删除计划文件（暂存文件不主动删，可能正被用户排查） */
export function clearPendingRestore(): void {
  fs.rmSync(pendingRestorePlanPath(), { force: true })
}

/** 原子写计划文件（先写 .tmp 再 rename，避免半截 JSON） */
function writePendingRestorePlan(plan: PendingRestorePlan): void {
  const file = pendingRestorePlanPath()
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(plan, null, 2)}\n`, 'utf8')
  fs.renameSync(tmp, file)
}
