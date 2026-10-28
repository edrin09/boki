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
import {
  DEFAULT_CIPHER_PARAMS,
  checkVerifier,
  isLegacyVaultMeta,
  readVaultMeta,
  vaultFilePath,
  writeVaultMetaAtomic,
  type AnyVaultMeta,
} from './sdk/vault'
import { deriveSubKey, INFO_DB, makeVerifier } from './sdk/vault-kdf'
import { resolveDatabasePath } from './config/database.config'
import { setMasterKey } from './vault/keystore'
import { startVaultConvertShell } from './vault/vault-bootstrap'
import { ensureVaultKeyFile, readVaultKeyFile, vaultKeyFilePath } from './vault/key-file'
import { canOpenDatabase, createEmptyDatabase } from './vault/db-open'
import { enableVaultEncryption, settleVaultMigration } from './vault/vault-migrate'
import { isPlaintextDatabase } from './vault/vault-backup'
import { encryptLegacyAttachments } from './vault/vault-attachments'

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap')

  // 插件运行时：先加载已启用插件，再把模块与实体交给 Nest / TypeORM
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

/** 密钥缺失 / 不匹配等致命错误：打印原因并退出，绝不让 TypeORM 用错密钥去开库 */
function exitVaultError(logger: Logger, message: string): never {
  logger.error(message)
  process.exit(1)
}

/** 读取密钥文件；不存在或非法则退出 */
function loadKeyFileOrExit(keyFile: string, logger: Logger): Buffer {
  try {
    const mk = readVaultKeyFile(keyFile)
    if (!mk) exitVaultError(logger, `密钥文件缺失：${keyFile}`)
    return mk
  } catch (err) {
    return exitVaultError(logger, (err as Error).message)
  }
}

/** 首次加密后，把历史明文附件就地加密一次（幂等） */
async function encryptAttachmentsOnce(logger: Logger, vaultFile: string): Promise<void> {
  const current = readVaultMeta()
  if (!current || isLegacyVaultMeta(current) || current.attachments?.enabled) return
  const count = await encryptLegacyAttachments((message) => logger.log(message))
  const after = readVaultMeta()
  if (after && !isLegacyVaultMeta(after)) {
    writeVaultMetaAtomic(vaultFile, {
      ...after,
      attachments: { enabled: true, encryptedAt: new Date().toISOString(), count },
    })
  }
}

/**
 * Vault 启动流程。
 *
 * 唯一密钥来源：程序根目录的 `vault.key`（32 字节 hex）。
 * | vault.json | vault.key | 行为 |
 * |:--|:--|:--|
 * | v1（旧主密码库） | — | 强制起转换页，输入一次原主密码/恢复码 → 写 vault.key + v2 元数据 |
 * | v2 | 存在且匹配 | 直接启动 |
 * | v2 | 缺失 / 不匹配 | 拒绝启动（加密库无法打开） |
 * | 不存在 + 明文库 | 存在/缺失 | 用现有或新生成的密钥强制加密 |
 * | 不存在 + 新库 | 缺失 | 生成 vault.key，建库并加密 |
 *
 * 任何情况下都不会在「库已是密文」时静默换一把新钥匙。
 */
async function prepareVault(
  meta: AnyVaultMeta | null,
  port: number,
  prefix: string,
  logger: Logger,
): Promise<void> {
  // 仅回归测试使用：显式明文库模式，跳过密钥文件
  if ((process.env.DB_CIPHER ?? '').toLowerCase() === 'plain') {
    logger.warn('DB_CIPHER=plain：已跳过密钥文件与库加密（仅限回归测试）')
    return
  }

  const dbPath = resolveDatabasePath()
  const vaultFile = vaultFilePath()
  const keyFile = vaultKeyFilePath()

  // ============ 1. 旧版主密码库：强制转换 ============
  if (isLegacyVaultMeta(meta)) {
    if (!fs.existsSync(dbPath)) {
      exitVaultError(
        logger,
        `检测到旧版加密元数据，但数据库文件不存在：${dbPath}\n请先恢复数据库文件，再启动完成转换。`,
      )
    }
    logger.warn('检测到旧版主密码加密库，升级必须一次性转换为密钥文件模式。')
    logger.warn(`转换后将生成密钥文件：${keyFile}（请务必备份，丢失后库无法打开）`)

    const shell = await startVaultConvertShell({
      port,
      prefix,
      meta,
      dbPath,
      vaultFile,
      keyFile,
      webDistDir: process.env.WEB_DIST_DIR,
      log: (message) => logger.log(message),
    })
    const result = shell.result
    await shell.close()

    if (!checkVerifier(result.mk, result.meta.verifier)) {
      exitVaultError(logger, '旧库转换完成，但密钥校验失败，请从备份恢复。')
    }
    setMasterKey(result.mk)
    logger.log('旧库已转换为密钥文件模式，原主密码/恢复码已失效。')
    await encryptAttachmentsOnce(logger, vaultFile)
    return
  }

  // ============ 2. 已有 v2 元数据 ============
  if (meta) {
    if (!fs.existsSync(dbPath)) {
      exitVaultError(
        logger,
        `检测到 vault.json 但数据库文件不存在：${dbPath}\n请恢复数据库文件后再启动。`,
      )
    }
    if (!fs.existsSync(keyFile)) {
      exitVaultError(
        logger,
        `数据库已加密，但密钥文件缺失：${keyFile}\n` +
          '没有 vault.key 无法打开数据库，系统不会启动。\n' +
          '请从备份恢复 vault.key（或恢复整套数据），不要新建同名文件。',
      )
    }
    const mk = loadKeyFileOrExit(keyFile, logger)
    if (!checkVerifier(mk, meta.verifier)) {
      exitVaultError(
        logger,
        `密钥文件与数据库不匹配：${keyFile}\n` +
          '当前 vault.key 不是这把库的钥匙。请恢复正确的密钥文件，或从备份恢复整套数据。',
      )
    }

    if (meta.enabled === 'migrating') {
      logger.warn('检测到未完成的加密迁移，正在自动恢复…')
      const settled = await settleVaultMigration(vaultFile, dbPath, keyFile, mk)
      logger.log(settled.message)
      if (settled.result === 'rolled-back') {
        logger.warn('已回滚到明文库，正在重新执行加密…')
        await enableVaultEncryption({
          dbPath,
          vaultFile,
          keyFile,
          mk,
          cipher: meta.cipher ?? DEFAULT_CIPHER_PARAMS,
          onProgress: (step) => logger.log(`[vault] ${step}`),
        })
      }
    }

    setMasterKey(mk)
    logger.log(`数据库已加密，密钥文件：${keyFile}`)
    await encryptAttachmentsOnce(logger, vaultFile)
    return
  }

  // ============ 3. 没有 vault.json ============
  // 3.1 库是密文但元数据丢了：只能用现有 vault.key 补回状态，绝不新建钥匙
  if (fs.existsSync(dbPath) && !isPlaintextDatabase(dbPath)) {
    if (!fs.existsSync(keyFile)) {
      exitVaultError(
        logger,
        `数据库已是加密状态，但缺少 vault.json 与 vault.key：${dbPath}\n` +
          '无法确定密钥，系统不会启动。请从备份恢复整套数据。',
      )
    }
    const mk = loadKeyFileOrExit(keyFile, logger)
    const cipher = DEFAULT_CIPHER_PARAMS
    if (!canOpenDatabase(dbPath, deriveSubKey(mk, INFO_DB).toString('hex'), cipher.legacy)) {
      exitVaultError(
        logger,
        `vault.key 无法打开该加密数据库：${keyFile}\n请恢复正确的密钥文件，或从备份恢复整套数据。`,
      )
    }
    writeVaultMetaAtomic(vaultFile, {
      version: 2,
      enabled: true,
      cipher,
      verifier: makeVerifier(mk),
      createdAt: new Date().toISOString(),
    })
    setMasterKey(mk)
    logger.warn('检测到加密数据库缺少 vault.json，已用现有 vault.key 补齐加密状态。')
    return
  }

  // 3.2 明文库 / 全新库：用密钥文件强制加密
  const hasKeyFile = fs.existsSync(keyFile)
  let mk: Buffer
  if (hasKeyFile) {
    mk = loadKeyFileOrExit(keyFile, logger)
  } else {
    const ensured = ensureVaultKeyFile(keyFile)
    mk = ensured.mk
    logger.warn(`未找到密钥文件，已生成新密钥：${keyFile}`)
    logger.warn('请将 vault.key 与数据库备份分开保管 —— 丢失后数据库将无法打开。')
  }

  if (!fs.existsSync(dbPath)) {
    logger.log('未找到数据库文件，正在创建并加密新库…')
    createEmptyDatabase(dbPath)
    // 空库还没有业务表，必须让 TypeORM 建表
    process.env.DB_SYNCHRONIZE = 'true'
  } else {
    logger.warn('检测到明文数据库，正在用密钥文件强制加密…')
  }

  await enableVaultEncryption({
    dbPath,
    vaultFile,
    keyFile,
    mk,
    onProgress: (step) => logger.log(`[vault] ${step}`),
  })
  setMasterKey(mk)
  logger.log(`数据库已加密，密钥文件：${keyFile}`)
  await encryptAttachmentsOnce(logger, vaultFile)
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
