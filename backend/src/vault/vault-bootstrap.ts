/**
 * 旧库升级的「转换壳」（bootstrap shell）。
 *
 * 场景：旧版主密码加密库（vault.json 为 version 1）。
 * 升级必须**强制**转换为密钥文件模式，否则系统不启动；但转换需要原口令
 * 解出旧 MK 一次，因此先起一个裸 `node:http` 服务，只提供：
 * 1. `GET  /<prefix>/vault/status`  → 告知前端「需要转换」与密钥文件位置
 * 2. `POST /<prefix>/vault/convert` → 校验旧主密码/恢复码，写完 vault.key 与 v2 元数据
 * 3. 静态托管前端构建产物（否则浏览器打不开转换页）
 *
 * 转换完成后关闭壳，让出端口给 Nest 应用。
 */
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as path from 'node:path'
import type { LegacyVaultMeta, VaultMeta } from '../sdk/vault'
import {
  UNLOCK_LOCK_AFTER_FAILURES,
  findUnlockThrottle,
  pruneUnlockAttempts,
  recordUnlockFailure,
  resetUnlockFailures,
} from './vault-throttle'
import { convertLegacyVaultToKeyFile } from './vault-legacy'

/** 请求体大小上限 */
const MAX_BODY_BYTES = 16 * 1024

export interface VaultConvertOptions {
  /** 监听端口（与最终 Nest 应用同一个端口） */
  port: number
  /** 接口前缀（默认 api） */
  prefix: string
  /** 旧版元数据 */
  meta: LegacyVaultMeta
  /** 数据库文件路径 */
  dbPath: string
  /** vault.json 路径 */
  vaultFile: string
  /** vault.key 路径 */
  keyFile: string
  /** 前端构建产物目录（可选） */
  webDistDir?: string
  /** 日志输出 */
  log?: (message: string) => void
}

export interface VaultConvertResult {
  mk: Buffer
  meta: VaultMeta
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
 * 启动转换壳。
 *
 * @returns 转换后的 MK 与「关闭并让出端口」的函数。
 */
export async function startVaultConvertShell(
  options: VaultConvertOptions,
): Promise<{ result: VaultConvertResult; close: () => Promise<void> }> {
  const { port, prefix, meta, dbPath, vaultFile, keyFile } = options
  const log = options.log ?? (() => undefined)
  const apiRoot = `/${prefix.replace(/^\/+/, '')}`
  const webDir = options.webDistDir && fs.existsSync(options.webDistDir) ? path.resolve(options.webDistDir) : null

  let resolveConverted: (result: VaultConvertResult) => void = () => undefined
  const convertedPromise = new Promise<VaultConvertResult>((resolve) => {
    resolveConverted = resolve
  })

  const handler = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    const url = req.url ?? '/'
    const pathname = url.split('?')[0]

    // ---------- 转换相关接口 ----------
    if (pathname === `${apiRoot}/vault/status` && req.method === 'GET') {
      sendJson(res, 200, {
        message: 'ok',
        data: {
          enabled: true,
          legacy: true,
          migrating: meta.enabled === 'migrating',
          hasRecovery: !!meta.recovery?.enabled,
          keyFile,
          createdAt: meta.createdAt,
        },
      })
      return
    }

    if (pathname === `${apiRoot}/vault/convert` && req.method === 'POST') {
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
      if (!password && !recoveryCode) {
        sendJson(res, 400, { code: 40010, message: '请输入原主密码或恢复码', data: null })
        return
      }

      let result: VaultConvertResult
      try {
        result = await convertLegacyVaultToKeyFile({
          meta,
          dbPath,
          vaultFile,
          keyFile,
          password: password || undefined,
          recoveryCode: recoveryCode || undefined,
          onProgress: (step) => log(`旧库转换：${step}`),
        })
      } catch (err) {
        const failure = recordUnlockFailure(ip, now)
        if (failure.locked) {
          log(`转换连续失败 ${UNLOCK_LOCK_AFTER_FAILURES} 次，${ip} 已锁定 5 分钟`)
          sendJson(res, 429, {
            code: 42910,
            message: '尝试次数过多，账户已临时锁定 5 分钟',
            data: { retryAfter: failure.retryAfter },
          })
          return
        }
        sendJson(res, 401, {
          code: 40110,
          message: (err as Error).message || '主密码或恢复码错误',
          data: { remaining: failure.remaining },
        })
        return
      }

      resetUnlockFailures(ip)
      log(`旧库已转换为密钥文件模式：${keyFile}`)
      sendJson(res, 200, {
        message: '转换完成，主密码/恢复码已失效',
        data: { converted: true, keyFile },
      })
      // 必须等响应发完再交接，否则前端拿不到 {code:0}
      res.on('finish', () => resolveConverted(result))
      return
    }

    // ---------- 静态资源（转换页需要前端产物） ----------
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
    // 显式绑 0.0.0.0 会导致 .NET/PowerShell 客户端连 ::1 被拒。
    server.listen(port, () => {
      server.removeListener('error', reject)
      resolve()
    })
  })

  log(`旧库转换服务已启动: http://localhost:${port}${apiRoot}/vault/status`)

  try {
    const result = await convertedPromise
    return { result, close: () => closeServer(server) }
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
