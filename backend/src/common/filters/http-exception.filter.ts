import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { QueryFailedError } from 'typeorm'

/**
 * 统一异常处理过滤器
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR
    let code: number = status
    let message: string | string[] = '服务器内部错误'
    let errorMsg: string | null = null
    let extraData: unknown = null

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      code = status
      const res = exception.getResponse() as any
      if (typeof res === 'string') {
        message = res
      } else if (res && typeof res === 'object') {
        message = res.message ?? exception.message
        errorMsg = typeof res.error === 'string' ? res.error : null
        // 业务错误码：内核/插件可以抛 { code: 42300, message, data }，
        // 此时 `code` 用业务码，HTTP 状态码保持不变（前端按 code 分支处理）。
        if (typeof res.code === 'number' && Number.isFinite(res.code)) {
          code = res.code
        }
        if (res.data !== undefined && res.data !== null) {
          extraData = res.data
        }
      } else {
        message = exception.message
      }
    } else if (exception instanceof QueryFailedError) {
      const driverError: any = (exception as any).driverError ?? {}
      const driverCode = driverError.code ?? ''
      if (driverCode === 'SQLITE_CONSTRAINT' || driverCode === 'SQLITE_CONSTRAINT_UNIQUE') {
        status = HttpStatus.BAD_REQUEST
        code = status
        message = '数据已存在或违反唯一/外键约束'
      } else if (driverCode === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        status = HttpStatus.BAD_REQUEST
        code = status
        message = '该数据已被其他单据引用，无法删除'
      } else {
        message = `数据库操作失败：${exception.message}`
      }
      this.logger.error(`QueryFailed: ${exception.message}`, exception.stack)
    } else if (exception instanceof Error) {
      message = exception.message
      this.logger.error(`Unhandled: ${exception.message}`, exception.stack)
    }

    const normalizedMessage = Array.isArray(message)
      ? (message[0] ?? '参数校验失败')
      : message || '请求失败'

    response.status(status).json({
      code,
      message: normalizedMessage,
      data: extraData,
      errors: Array.isArray(message) ? message : undefined,
      error: errorMsg ?? undefined,
      path: request.url,
      timestamp: Date.now(),
    })
  }
}