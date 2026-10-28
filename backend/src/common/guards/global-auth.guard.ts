import { ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'

/**
 * 全局认证守卫：默认所有接口需登录，`@Public()` 可跳过。
 *
 * 库密钥在进程启动时就从 `vault.key` 加载完成，运行期不存在「锁定」状态，
 * 因此这里只保留登录校验。
 */
@Injectable()
export class GlobalAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super()
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true
    return super.canActivate(context)
  }
}
