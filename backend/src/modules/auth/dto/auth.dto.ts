import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

/**
 * 登录 DTO
 */
export class LoginDto {
  @IsString({ message: '请输入用户名' })
  @IsNotEmpty({ message: '请输入用户名' })
  @MaxLength(50, { message: '用户名过长' })
  username: string

  @IsString({ message: '请输入密码' })
  @IsNotEmpty({ message: '请输入密码' })
  @MinLength(6, { message: '密码至少 6 位' })
  @MaxLength(64, { message: '密码过长' })
  password: string

  @IsOptional()
  @IsString()
  rememberMe?: string
}

/**
 * 切换记账公司 DTO
 */
export class SwitchCompanyDto {
  @IsString({ message: '请选择公司' })
  @IsNotEmpty({ message: '请选择公司' })
  companyId: string
}

/**
 * 修改密码 DTO
 */
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: '请输入原密码' })
  oldPassword: string

  @IsString()
  @IsNotEmpty({ message: '请输入新密码' })
  @MinLength(6, { message: '新密码至少 6 位' })
  @MaxLength(64, { message: '密码过长' })
  newPassword: string
}