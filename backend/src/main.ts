import 'reflect-metadata'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { Logger, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { Reflector } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import type { NextFunction, Request, Response } from 'express'
import { AppModule } from './modules/app.module'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'
import { LogInterceptor } from './common/interceptors/log.interceptor'
import { TransformInterceptor } from './common/interceptors/transform.interceptor'
import { SystemService } from './modules/system/system.service'

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap')
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
  })

  const prefix = process.env.APP_PREFIX || 'api'
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

  const port = Number(process.env.APP_PORT || 3000)
  await app.listen(port, '0.0.0.0')

  logger.log(`应用已启动: http://localhost:${port}/${prefix}`)
  logger.log(`接口文档: http://localhost:${port}/${prefix}`)
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