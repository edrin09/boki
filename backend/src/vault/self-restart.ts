/**
 * 后端进程自重启。
 *
 * 用途：数据库恢复必须发生在**没有连接**的时候（见 `pending-restore.ts`），
 * 所以「恢复」只能两步走 —— 先暂存，再重启换库。这里负责第二步：
 * 让服务自己重启，用户点完恢复不需要再去手动开一遍命令行。
 *
 * 顺序很关键：
 * 1. 先 spawn 一个同参数的新进程（detached，脱离当前进程组，父进程退出后
 *    它继续跑）；此刻旧进程仍占着端口，新进程在 listen 阶段退避重试；
 * 2. 观察 1.5 秒，新进程若是立刻退出（被杀 / 启动即报错）就**取消重启**，
 *    当前服务继续用旧库跑 —— 绝不能因为自动重启失败把服务搞挂；
 * 3. 确认新进程活着，再 `app.close()` 释放端口与 TypeORM 连接，然后退出。
 *
 * 新进程启动时会执行 `applyPendingRestore()`，主库在此刻被原子替换。
 *
 * 被 PM2 等进程管理器托管时**不自己 spawn**：直接退出，交给管理器拉起，
 * 否则会出现双实例抢端口。
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { resolveDatabasePath } from '../config/database.config'

/** 本进程启动时间（用于前端判断「确实换了一个新进程」） */
const PROCESS_STARTED_AT = new Date(Date.now() - process.uptime() * 1000)

/** 供 /api/health 输出 */
export function processStartedAt(): string {
  return PROCESS_STARTED_AT.toISOString()
}

/** 只依赖 close()，避免把 @nestjs 类型拖进来 */
interface RestartableApp {
  close: () => Promise<unknown>
}

let restartableApp: RestartableApp | null = null
let scheduled = false

/** main.ts 启动后注册，供自重启时优雅关闭 */
export function registerRestartableApp(app: RestartableApp): void {
  restartableApp = app
}

/** 是否已安排重启（用于接口幂等判断） */
export function isRestartScheduled(): boolean {
  return scheduled
}

export interface SelfRestartOptions {
  /** 延迟毫秒数：留出时间把 HTTP 响应完整写回前端 */
  delayMs?: number
  /** 日志出口（传 Nest Logger 的方法） */
  log?: (message: string) => void
}

/**
 * 安排一次自重启（幂等：重复调用只生效第一次）。
 *
 * 默认延迟 2 秒：恢复接口的响应一般 < 300ms 就发完了，
 * 留 2 秒是为了慢网络下前端也能先拿到「恢复成功」的响应再断连。
 */
export function scheduleSelfRestart(options: SelfRestartOptions = {}): void {
  if (scheduled) return
  scheduled = true

  const log = options.log ?? (() => undefined)
  const delay = Math.max(0, options.delayMs ?? 2000)
  log(`已安排 ${delay}ms 后自动重启服务以切换数据库`)

  const timer = setTimeout(() => {
    void restartNow(log)
  }, delay)
  // 不要因为这个定时器把进程吊着不退出
  timer.unref?.()
}

async function restartNow(log: (message: string) => void): Promise<void> {
  const entry = process.argv[1] ?? ''
  if (entry.endsWith('.ts')) {
    // ts-node 直跑时无法可靠复刻启动命令；宁可放弃重启，也别把服务弄没
    scheduled = false
    log(
      `当前以源码模式运行（${path.basename(entry)}），无法自动拉起新进程；` +
        '已取消自动重启，当前服务继续运行，恢复会在下次启动时生效',
    )
    return
  }

  // PM2 托管：自己退出即可，由管理器拉起（避免双实例）
  if (process.env.pm_id || process.env.PM2_HOME) {
    log('检测到 PM2 托管，退出当前进程，由 PM2 自动拉起')
    process.exit(0)
  }

  // 1) 先拉起新进程（此时旧进程仍占着端口，新进程会在 listen 阶段退避重试）
  let child: ChildProcess | null = null
  try {
    const stdio = restartLogFd()
    child = spawn(process.execPath, process.argv.slice(1), {
      cwd: process.cwd(),
      env: { ...process.env, BOKI_SELF_RESTART: '1' },
      detached: true,
      windowsHide: true,
      stdio: ['ignore', stdio, stdio],
    })
    child.unref()
  } catch (err) {
    // 拉不起来就彻底放弃：保留当前服务（旧库仍可用），恢复等下次手动重启
    scheduled = false
    log(`拉起新进程失败：${(err as Error).message}；已取消自动重启，当前服务继续运行`)
    return
  }

  // 2) 观察一小段时间：新进程立刻退出（被杀 / 启动即报错）就放弃，绝不把服务搞挂
  const died = await exitedEarly(child, 1500)
  if (died) {
    scheduled = false
    log('新进程启动后立即退出；已取消自动重启，当前服务继续用旧库运行（恢复会在下次启动时生效）')
    return
  }
  log(`新进程 pid=${child.pid} 已启动，正在移交端口`)

  // 3) 让出端口与数据库连接，新进程的重试会接管
  if (restartableApp) {
    try {
      await withTimeout(restartableApp.close(), 8000, '关闭服务超时')
      log('HTTP 服务与数据库连接已关闭')
    } catch (err) {
      log(`关闭服务时出错（继续重启）：${(err as Error).message}`)
    }
  }

  setTimeout(() => process.exit(0), 200)
}

/** 子进程是否在 ms 内就退出了（用于放弃注定失败的重启） */
function exitedEarly(child: ChildProcess, ms: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false
    const done = (exited: boolean) => {
      if (settled) return
      settled = true
      resolve(exited)
    }
    const timer = setTimeout(() => done(false), ms)
    timer.unref?.()
    child.once('exit', () => {
      clearTimeout(timer)
      done(true)
    })
    child.once('error', () => {
      clearTimeout(timer)
      done(true)
    })
  })
}

/**
 * 新进程的 stdout / stderr 落盘。
 *
 * 必须写文件而不是 inherit：detached 的子进程如果继承了控制台句柄，
 * 父进程退出后句柄会失效，日志直接丢掉。
 */
function restartLogFd(): number | 'ignore' {
  try {
    const dir = path.join(path.dirname(resolveDatabasePath()), 'logs')
    fs.mkdirSync(dir, { recursive: true })
    return fs.openSync(path.join(dir, 'restart.log'), 'a')
  } catch {
    return 'ignore'
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    timer.unref?.()
    p.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}
