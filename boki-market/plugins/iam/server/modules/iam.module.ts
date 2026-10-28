import { Module } from '@nestjs/common'
import { UsersModule } from './users/users.module'
import { RolesModule } from './roles/roles.module'
import { PermissionsModule } from './permissions/permissions.module'

/**
 * 用户与权限管理插件（IAM）。
 *
 * 只接管「管理面」：用户 CRUD、角色、权限树与授权。
 * 登录、JWT、公司上下文、权限判定（GlobalAuthGuard / PermissionsGuard /
 * RolesGuard）与权限/角色种子仍留在内核，保证未安装本插件时：
 * - 内置管理员仍可登录并拥有全部权限；
 * - 内核记账流程不受影响。
 */
@Module({
  imports: [UsersModule, RolesModule, PermissionsModule],
})
export class IamModule {}
