import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'
import { Observable } from 'rxjs'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import { isVaultLocked, touchActivity } from '../../vault/keystore'

/**
 * 全局认证守卫：默认所有接口需登录，@Public() 可跳过。
 *
 * 同时承担「锁定态守卫」的职责（§6.7）：
 * 库已加密但当前处于锁定状态时，除了 `/vault/*` 之外的接口一律返回
 * 423（数据已锁定），避免任何接口在无密钥的状态下去碰数据库。
 */
@Injectable()
export class GlobalAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super()
  }

  canActivate(context: ExecutionContext) {
    // 锁定态：只放行 /vault/*（解锁相关）
    if (isVaultLocked() && !isVaultPath(context)) {
      throw new HttpException(
        { code: 42300, message: '数据已锁定，请先解锁' },
        HttpStatus.LOCKED,
      )
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const result = super.canActivate(context)
    // passport 的 canActivate 返回 boolean / Promise / Observable，
    // 这里统一包一层，等认证真正通过后再记录活动时间（闲置锁定计时）。
    if (isPromiseLike(result)) {
      return result.then((ok) => {
        if (ok) touchActivity()
        return ok
      })
    }
    if (isObservableLike(result)) {
      return new Observable<boolean>((subscriber) => {
        const sub = (result as any).subscribe({
          next: (ok: boolean) => {
            if (ok) touchActivity()
            subscriber.next(ok)
          },
          error: (err: any) => subscriber.error(err),
          complete: () => subscriber.complete(),
        })
        return () => sub.unsubscribe()
      })
    }
    if (result) touchActivity()
    return result
  }
}

/**
 * 判断请求是否指向 `/vault/*`。
 *
 * 全局前缀可能是 `api` 或其它，统一剥离后再比对。
 */
export function isVaultPath(context: ExecutionContext): boolean {
  const req = context.switchToHttp().getRequest()
  const url: string = req?.originalUrl ?? req?.url ?? ''
  const pathname = url.split('?')[0]
  const prefix = `/${(process.env.APP_PREFIX || 'api').replace(/^\/+/, '')}`
  const rel = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname
  return rel === '/vault' || rel.startsWith('/vault/')
}

function isPromiseLike(v: unknown): v is PromiseLike<boolean> {
  return !!v && typeof (v as any).then === 'function'
}

function isObservableLike(v: unknown): boolean {
  return !!v && typeof (v as any).subscribe === 'function'
}
