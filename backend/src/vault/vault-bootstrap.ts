/**
 * 加密库的「引导壳」（bootstrap shell）。
 *
 * 场景：库已加密，但当前进程没有密钥（桌面壳刚拉起 / 用户还没输主密码）。
 * 此时**不能**建 Nest、不能连库（没有 key 去开密文库，SQLite 会报
 * 「file is not a database」，而 synchronize 可能尝试重建表 → 数据丢失）。
 *
 * 因此先起一个裸 `node:http` 服务，只提供三件事：
 * 1. `GET  /<prefix>/vault/status`   → 告诉前端「库已锁定」
 * 2. `POST /<prefix>/vault/unlock`   → 校验主密码，成功后把 MK 交回调用方
 * 3. 静态托管前端构建产物（否则浏览器打不开解锁页）
 *
 * 拿到 MK 后关闭壳，让出端口给 Nest 应用（端口交接，见 §5.3）。
 */
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as path from 'node:path'
import { checkVerifier, type VaultMeta, type VaultProvider } from '../sdk/vault'
import { normalizeRecoveryCode } from '../sdk/vault-kdf'
import {
  UNLOCK_LOCK_AFTER_FAILURES,
  findUnlockThrottle,
  pruneUnlockAttempts,
  recordUnlockFailure,
  resetUnlockFailures,
} from './vault-throttle'

/** 请求体大小上限 */
const MAX_BODY_BYTES = 16 * 1024

export interface VaultBootstrapOptions {
  /** 监听端口（与最终 Nest 应用同一个端口） */
  port: number
  /** 接口前缀（默认 api） */
  prefix: string
  /** vault 元数据 */
  meta: VaultMeta
  /** provider：负责由口令派生 MK */
  provider: VaultProvider
  /** 前端构建产物目录（可选） */
  webDistDir?: string
  /** 日志输出 */
  log?: (message: string) => void
}

/** 取客户端 IP（只认最外层的 X-Forwarded-For 首段） */
function clientIp(req: http.IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for']
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded
  if (raw) return raw.split(',')[0].trim()
  return req.socket.remoteAddress || 'unknown'
}

/** 读取并解析 JSON 请求体 */
function readJsonBody(req: http.IncomingMessage): Promise<Record<string, any>> {
  return new Promise((resolve) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        req.destroy()
        resolve({})
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!chunks.length) {
        resolve({})
        return
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        resolve(parsed && typeof parsed === 'object' ? parsed : {})
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}

/** 统一响应包装（与内核 TransformInterceptor 保持一致） */
function sendJson(res: http.ServerResponse, status: number, payload: Record<string, any>): void {
  const body = JSON.stringify({ code: status === 200 ? 0 : status, ...payload, timestamp: Date.now() })
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

/** 静态文件 MIME 映射 */
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
}

/**
 * 启动引导壳。
 *
 * @returns 主密钥 MK 与「关闭并让出端口」的函数。
 *          调用方拿到 MK 后必须先 `close()`，再让 Nest 接管同一端口。
 */
export async function startVaultBootstrapShell(
  options: VaultBootstrapOptions,
): Promise<{ mk: Buffer; close: () => Promise<void> }> {
  const { port, prefix, meta, provider } = options
  const log = options.log ?? (() => undefined)
  const apiRoot = `/${prefix.replace(/^\/+/, '')}`
  const webDir = options.webDistDir && fs.existsSync(options.webDistDir) ? path.resolve(options.webDistDir) : null

  let resolveUnlock: (mk: Buffer) => void = () => undefined
  let rejectUnlock: (err: Error) => void = () => undefined
  const unlockPromise = new Promise<Buffer>((resolve, reject) => {
    resolveUnlock = resolve
    rejectUnlock = reject
  })

  const handler = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    const url = req.url ?? '/'
    const pathname = url.split('?')[0]

    // ---------- 解锁相关接口 ----------
    if (pathname === `${apiRoot}/vault/status` && req.method === 'GET') {
      sendJson(res, 200, {
        message: 'ok',
        data: {
          enabled: true,
          locked: true,
          provider: meta.provider,
          kdf: { algo: meta.kdf.algo, N: meta.kdf.N, r: meta.kdf.r, p: meta.kdf.p },
          createdAt: meta.createdAt,
          hasRecovery: !!meta.recovery?.enabled,
        },
      })
      return
    }

    if (pathname === `${apiRoot}/vault/unlock` && req.method === 'POST') {
      const now = Date.now()
      pruneUnlockAttempts(now)
      const ip = clientIp(req)

      const throttled = findUnlockThrottle(ip, now)
      if (throttled) {
        sendJson(res, 429, {
          code: 42910,
          message: `尝试过于频繁，请 ${throttled.retryAfter} 秒后再试`,
          data: { retryAfter: throttled.retryAfter },
        })
        return
      }

      const body = await readJsonBody(req)
      const password = typeof body.password === 'string' ? body.password : ''
      const recoveryCode = typeof body.recoveryCode === 'string' ? body.recoveryCode : ''

      let mk: Buffer | null = null
      try {
        if (recoveryCode) {
          if (!provider.deriveFromRecovery) throw new Error('当前环境未启用恢复码')
          mk = provider.deriveFromRecovery(normalizeRecoveryCode(recoveryCode), meta)
        } else {
          if (!password) throw new Error('请输入主密码')
          mk = provider.deriveKey(password, meta)
        }
        if (!checkVerifier(mk, meta.verifier)) {
          // 解包成功但校验块不匹配：文件与密钥不匹配（极少见的损坏场景）
          mk = null
          throw new Error('密钥与数据文件不匹配，数据可能已损坏')
        }
      } catch (err) {
        const failure = recordUnlockFailure(ip, now)
        if (failure.locked) {
          log(`解锁连续失败 ${UNLOCK_LOCK_AFTER_FAILURES} 次，${ip} 已锁定 5 分钟`)
          sendJson(res, 429, {
            code: 42910,
            message: '尝试次数过多，账户已临时锁定 5 分钟',
            data: { retryAfter: failure.retryAfter },
          })
          return
        }
        sendJson(res, 401, {
          code: 40110,
          message: (err as Error).message || '主密码错误',
          data: { remaining: failure.remaining },
        })
        return
      }

      resetUnlockFailures(ip)
      sendJson(res, 200, { message: '解锁成功', data: { unlocked: true } })
      // 必须等响应发完再交接，否则前端拿不到 {code:0}
      res.on('finish', () => resolveUnlock(mk as Buffer))
      return
    }

    // ---------- 静态资源（解锁页需要前端产物） ----------
    if (webDir && (req.method === 'GET' || req.method === 'HEAD')) {
      if (pathname.startsWith(apiRoot)) {
        sendJson(res, 404, { code: 404, message: '接口不存在', data: null })
        return
      }
      let rel = decodeURIComponent(pathname)
      if (rel.endsWith('/')) rel += 'index.html'
      let file = path.join(webDir, rel)
      // 防目录穿越
      if (!file.startsWith(webDir)) {
        sendJson(res, 403, { code: 403, message: '非法路径', data: null })
        return
      }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        // SPA 回退
        file = path.join(webDir, 'index.html')
        if (!fs.existsSync(file)) {
          sendJson(res, 404, { code: 404, message: 'Not Found', data: null })
          return
        }
      }
      const ext = path.extname(file).toLowerCase()
      res.writeHead(200, {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      })
      if (req.method === 'HEAD') {
        res.end()
        return
      }
      fs.createReadStream(file).pipe(res)
      return
    }

    sendJson(res, 404, { code: 404, message: 'Not Found', data: null })
  }

  const server = http.createServer((req, res) => {
    handler(req, res).catch((err) => {
      try {
        sendJson(res, 500, { code: 500, message: (err as Error).message, data: null })
      } catch {
        res.destroy()
      }
    })
  })

  // 避免 keep-alive 连接把 close() 卡住
  server.keepAliveTimeout = 1000
  server.headersTimeout = 5000

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    // 不指定 host，让它绑定 ::（dual-stack）：Windows 上 localhost 会先解析 ::1，
    // 显式绑 0.0.0.0 会导致 .NET/PowerShell 客户端连 ::1 被拒（T7 踩坑实测）。
    server.listen(port, () => {
      server.removeListener('error', reject)
      resolve()
    })
  })

  log(`Vault 解锁服务已启动: http://localhost:${port}${apiRoot}/vault/status`)

  try {
    const mk = await unlockPromise
    return { mk, close: () => closeServer(server) }
  } catch (err) {
    await closeServer(server)
    throw err
  }
}

/** 关闭引导壳，释放端口 */
export function closeServer(server: http.Server): Promise<void> {
  return new Promise<void>((resolve) => {
    server.closeAllConnections?.()
    server.close(() => resolve())
  })
}
