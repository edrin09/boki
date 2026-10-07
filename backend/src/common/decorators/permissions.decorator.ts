import { SetMetadata } from '@nestjs/common'

export const PERMISSIONS_KEY = 'permissions'

/**
 * 声明访问该接口所需的权限标识（可多个，满足其一即可）
 * 例：@RequirePermissions('voucher:create')
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions)