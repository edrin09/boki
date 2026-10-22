import { IsOptional, IsString, MinLength } from 'class-validator'

/** 解锁请求 */
export class VaultUnlockDto {
  /** 主密码 */
  @IsOptional()
  @IsString()
  password?: string

  /** 恢复码（与主密码二选一） */
  @IsOptional()
  @IsString()
  recoveryCode?: string
}

/** 开启加密请求 */
export class VaultEnableDto {
  @IsString()
  @MinLength(1)
  password: string

  @IsString()
  @MinLength(1)
  confirm: string
}

/** 修改主密码请求 */
export class VaultRekeyDto {
  @IsString()
  @MinLength(1)
  oldPassword: string

  @IsString()
  @MinLength(1)
  newPassword: string
}

/** 恢复码确认请求 */
export class VaultRecoveryConfirmDto {
  @IsString()
  @MinLength(1)
  code: string
}

/** 闲置锁定策略请求 */
export class VaultIdleLockDto {
  /** 分钟数，0 = 关闭 */
  @IsString()
  minutes: string
}
