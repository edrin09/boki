import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ROLES_KEY } from '../decorators/roles.decorator'

/**
 * 角色守卫：校验当前用户角色
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!required || required.length === 0) return true

    const request = context.switchToHttp().getRequest()
    const user = request.user
    if (!user) throw new ForbiddenException('未登录或登录已过期')

    const roleCodes: string[] = user.roles ?? []
    const has = required.some((r) => roleCodes.includes(r))
    if (!has) {
      throw new ForbiddenException(`无权限执行此操作，需要角色：${required.join(' 或 ')}`)
    }
    return true
  }
}