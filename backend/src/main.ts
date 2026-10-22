import 'reflect-metadata'
// 必须早于 AppModule：避免 sherpa-onnx 抢先加载 ONNX Runtime DLL
import './plugins/ocr-native.preload'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { Logger, ValidationPipe } from '@nestjs/common'
import { NestFactory, Reflector } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import type { NextFunction, Request, Response } from 'express'
import { AppModule } from './modules/app.module'
import { loadPluginRuntime } from './plugins/plugin.loader'
import { clearSyncRequired } from './plugins/plugin.state'
import { syncRequiredMarker } from './plugins/plugin.paths'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'
import { LogInterceptor } from './common/interceptors/log.interceptor'
import { TransformInterceptor } from './common/interceptors/transform.interceptor'
import { SystemService } from './modules/system/system.service'
import { checkVerifier, readVaultMeta, resolveVaultProvider, type VaultMeta } from './sdk/vault'
import { setBootKey, setVaultEnabled } from './vault/keystore'
import { startVaultBootstrapShell } from './vault/vault-bootstrap'

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap')

  // 插件运行时：先加载已启用插件，再把模块与实体交给 Nest / TypeORM
  // ⚠️ 必须早于 vault 解锁：插件在 server/index.js 顶层注册 vault provider
  const runtime = loadPluginRuntime()
  for (const error of runtime.errors) {
    logger.warn(`插件 ${error.id} 未加载：${error.message}`)
  }
  if (runtime.plugins.length) {
    logger.log(`已启用插件：${runtime.plugins.map((p) => `${p.manifest.id}@${p.manifest.version}`).join(', ')}`)
  }
  const pendingSync = fs.existsSync(syncRequiredMarker())

  const prefix = process.env.APP_PREFIX || 'api'
  const port = Number(process.env.APP_PORT || 3000)

  // ============ Vault 三态判定（§5.1） ============
  const vaultMeta = readVaultMeta()
  await prepareVault(vaultMeta, port, prefix, logger)

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register(runtime.modules, runtime.entities),
    { bufferLogs: false },
  )

  app.setGlobalPrefix(prefix)

  // 全局校验管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
    }),
  )

  // 统一响应与异常处理
  app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)))
  // 操作日志：依赖 SystemModule（@Global）提供 SystemService
  app.useGlobalInterceptors(new LogInterceptor(app.get(Reflector), app.get(SystemService)))
  app.useGlobalFilters(new HttpExceptionFilter())

  // 跨域
  const corsOrigin = process.env.CORS_ORIGIN || '*'
  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((s) => s.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  })

  // 静态托管前端构建产物：打包版与 API 同源，免 Nginx、免跨域
  serveWebDist(app, prefix)

  await listenWithRetry(app, port, logger)

  // schema 同步已完成，清理一次性标记
  if (pendingSync) clearSyncRequired()

  logger.log(`应用已启动: http://localhost:${port}/${prefix}`)
  logger.log(`接口文档: http://localhost:${port}/${prefix}`)
}

/**
 * Vault 启动分支（§5.1）。
 *
 * | vault.json | bootKey | 分支 | 行为 |
 * |:--|:--|:--|:--|
 * | 不存在 | — | A | 现状，直接启动完整 app |
 * | `migrating` | — | R | 拒绝启动，打印恢复指引 |
 * | `true` | 有（BOKI_VAULT_KEY） | B | 直接启动（无人值守，放弃零知识） |
 * | `true` | 无 | C | 先起 bootstrap shell，解锁后再起完整 app |
 */
async function prepareVault(
  meta: VaultMeta | null,
  port: number,
  prefix: string,
  logger: Logger,
): Promise<void> {
  if (!meta || meta.enabled === false) {
    setVaultEnabled(false)
    return
  }

  // 分支 R：迁移中间态 —— 拒绝服务，打印恢复指引
  if (meta.enabled === 'migrating') {
    logger.error('检测到未完成的加密迁移，已拒绝启动以保护数据。')
    logger.error('请执行 `npm run vault:recover` 按提示恢复。')
    process.exit(1)
  }

  const provider = resolveVaultProvider(meta)
  if (!provider) {
    // 最高危场景（M5）：库是密文，但拿不到 provider。
    // 此时**绝不能**让 TypeORM 用「无 key」的方式去开库 ——
    // SQLite 会把加密文件当成损坏文件，而 synchronize 可能尝试重建表，数据就没了。
    logger.error(`缺少 vault provider（${meta.provider}），无法打开加密数据库。`)
    logger.error('请恢复 data/plugins 下的 vault 插件目录，或从备份恢复数据。')
    process.exit(1)
  }

  // 分支 B：无人值守（服务器场景）
  const envKey = process.env.BOKI_VAULT_KEY
  if (envKey) {
    logger.warn('BOKI_VAULT_KEY 已启用：本机不具备零知识保护，主密码不再起到保护作用。')
    const mk = provider.deriveKey(envKey, meta)
    if (!checkVerifier(mk, meta.verifier)) {
      logger.error('BOKI_VAULT_KEY 与数据库不匹配，无法打开。')
      process.exit(1)
    }
    setBootKey(mk)
    setVaultEnabled(true)
    return
  }

  // 分支 C：先起引导壳，拿到 MK 后让出端口给 Nest
  logger.log('数据库已加密，等待主密码解锁…')
  const shell = await startVaultBootstrapShell({
    port,
    prefix,
    meta,
    provider,
    webDistDir: process.env.WEB_DIST_DIR,
    log: (message) => logger.log(message),
  })
  await shell.close()

  if (!checkVerifier(shell.mk, meta.verifier)) {
    logger.error('解锁校验失败：密钥与数据文件不匹配。')
    process.exit(1)
  }
  setBootKey(shell.mk)
  setVaultEnabled(true)
  logger.log('已解锁，正在启动应用…')
}

/**
 * 监听端口（带 EADDRINUSE 重试）。
 *
 * 端口交接存在 50~300ms 空窗，Windows 上偶发端口未及时释放，
 * 这里做有限次退避重试，避免用户看到「服务启动失败」。
 */
async function listenWithRetry(
  app: NestExpressApplication,
  port: number,
  logger: Logger,
): Promise<void> {
  const maxAttempts = 20
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await app.listen(port, '0.0.0.0')
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code
      if (code !== 'EADDRINUSE' || attempt === maxAttempts) throw err
      logger.warn(`端口 ${port} 仍被占用，第 ${attempt} 次重试…`)
      await new Promise((r) => setTimeout(r, 50 * attempt))
    }
  }
}

/**
 * 托管 frontend/dist 并做 SPA 路由回退。
 *
 * 未设置 WEB_DIST_DIR 或目录不存在时完全跳过，开发期（Vite 5175 代理）行为不变。
 *
 * 注意：Express 5 的 path-to-regexp v8 已不支持 `app.get('*')` 通配写法，
 * 直接写会抛 TypeError，因此回退必须用不带路径的中间件形式注册。
 */
function serveWebDist(app: NestExpressApplication, prefix: string): void {
  const raw = process.env.WEB_DIST_DIR
  if (!raw) return

  const webDir = path.resolve(raw)
  const indexFile = path.join(webDir, 'index.html')
  if (!fs.existsSync(indexFile)) {
    new Logger('Static').warn(`WEB_DIST_DIR 无效，未找到 ${indexFile}，跳过前端托管`)
    return
  }

  const apiRoot = `/${prefix.replace(/^\/+/, '')}`
  const expressApp = app.getHttpAdapter().getInstance()

  // 静态资源：html 不缓存，避免改版后客户端拿旧壳
  app.useStaticAssets(webDir, {
    index: false,
    setHeaders: (res: Response, filePath: string) => {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache')
    },
  })

  // 回退：非 API 的 GET 一律交回 index.html，交给前端路由
  expressApp.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    if (req.path === apiRoot || req.path.startsWith(`${apiRoot}/`)) return next()
    if (path.extname(req.path)) return next() // 缺失的真实文件走 404，不伪装成页面
    res.sendFile(indexFile)
  })

  new Logger('Static').log(`前端已托管: ${webDir}`)
}

bootstrap()
