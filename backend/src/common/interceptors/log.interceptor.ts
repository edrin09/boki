import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Observable, tap } from 'rxjs'
import type { Request, Response } from 'express'
import { OPERATION_KEY } from '../decorators/operation.decorator'
import { tryGetCurrentUser } from '../utils/request.util'
import { SystemService } from '../../modules/system/system.service'

/** 不记录日志的路径前缀 */
const IGNORE_PATHS = ['/auth/login', '/auth/logout', '/auth/profile']

/**
 * 操作日志拦截器：记录带 @Operation() 描述的写操作与查询
 */
@Injectable()
export class LogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly systemService: SystemService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp()
    const req = http.getRequest<Request>()
    const res = http.getResponse<Response>()

    const description = this.reflector.getAllAndOverride<string>(OPERATION_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!description || IGNORE_PATHS.includes(req.path)) {
      return next.handle()
    }

    const startAt = Date.now()
    const user = tryGetCurrentUser(req)

    return next.handle().pipe(
      tap({
        next: () => {
          void this.write({
            req,
            description,
            userId: user?.sub ?? null,
            username: user?.username ?? null,
            duration: Date.now() - startAt,
            success: res.statusCode < 400,
          })
        },
        error: (err: any) => {
          void this.write({
            req,
            description,
            userId: user?.sub ?? null,
            username: user?.username ?? null,
            duration: Date.now() - startAt,
            success: false,
            errorMsg: err?.message ?? String(err),
          })
        },
      }),
    )
  }

  private async write(params: {
    req: Request
    description: string
    userId: string | null
    username: string | null
    duration: number
    success: boolean
    errorMsg?: string
  }): Promise<void> {
    const { req } = params
    const body = req.body
    let paramsText: string | null = null
    try {
      if (body && typeof body === 'object') {
        const redacted = { ...body }
        if ('password' in redacted) redacted.password = '***'
        if ('newPassword' in redacted) redacted.newPassword = '***'
        if ('oldPassword' in redacted) redacted.oldPassword = '***'
        paramsText = JSON.stringify(redacted).slice(0, 1000)
      }
    } catch {
      paramsText = null
    }

    await this.systemService.record({
      userId: params.userId,
      username: params.username,
      module: req.path.split('/')[1] ?? '',
      action: params.description,
      method: req.method,
      path: req.originalUrl ?? req.url,
      params: paramsText,
      ip:
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.ip ||
        req.socket?.remoteAddress ||
        null,
      userAgent: (req.headers['user-agent'] ?? '').slice(0, 300) || null,
      success: params.success,
      errorMsg: params.errorMsg ?? null,
      duration: params.duration,
    })
  }
}