import { SetMetadata } from '@nestjs/common'

export const SKIP_WRAP_KEY = 'skip_wrap'

/**
 * 跳过统一响应包装
 */
export const SkipWrap = () => SetMetadata(SKIP_WRAP_KEY, true)