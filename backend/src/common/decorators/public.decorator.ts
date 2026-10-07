import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC_KEY = 'is_public'

/**
 * 标记接口无需认证（如登录、初始化检查）
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)