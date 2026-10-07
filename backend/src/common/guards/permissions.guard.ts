import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator'

/**
 * 权限守卫：校验当前用户是否拥有接口声明的权限标识
 * - 未声明 @RequirePermissions 则放行
 * - admin 角色默认拥有全部权限
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!required || required.length === 0) return true

    const request = context.switchToHttp().getRequest()
    const user = request.user
    if (!user) throw new ForbiddenException('未登录或登录已过期')

    const roleCodes: string[] = user.roles ?? []
    if (roleCodes.includes('admin')) return true

    const owned: string[] = user.permissions ?? []
    const has = required.some((p) => owned.includes(p))
    if (!has) {
      throw new ForbiddenException(`无权限执行此操作，需要权限：${required.join(' 或 ')}`)
    }
    return true
  }
}