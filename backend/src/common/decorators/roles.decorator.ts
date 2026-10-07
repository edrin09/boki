import { SetMetadata } from '@nestjs/common'

export const ROLES_KEY = 'roles'

/**
 * 声明访问该接口所需的角色标识（可多个，满足其一即可）
 */
export const RequireRoles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles)