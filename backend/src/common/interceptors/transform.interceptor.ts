import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Observable, map } from 'rxjs'
import { SKIP_WRAP_KEY } from '../decorators/skip-wrap.decorator'

/**
 * 统一响应包装：{ code: 0, message: 'ok', data, timestamp }
 * 使用 @SkipWrap() 可跳过包装。
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_WRAP_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    return next.handle().pipe(
      map((data) => {
        if (skip) return data
        return {
          code: 0,
          message: 'ok',
          data: data ?? null,
          timestamp: Date.now(),
        }
      }),
    )
  }
}