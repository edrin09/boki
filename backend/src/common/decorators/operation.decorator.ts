import { SetMetadata } from '@nestjs/common'

export const OPERATION_KEY = 'operation'

/**
 * 声明操作日志描述，如 @Operation('新增会计科目')
 */
export const Operation = (description: string) => SetMetadata(OPERATION_KEY, description)