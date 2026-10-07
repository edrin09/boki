import { Type } from 'class-transformer'
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator'

/** 新增用户 DTO */
export class CreateUserDto {
  @IsString()
  @IsNotEmpty({ message: '请输入登录账号' })
  @MaxLength(50, { message: '账号过长' })
  username: string

  @IsString()
  @IsNotEmpty({ message: '请输入姓名' })
  @MaxLength(50, { message: '姓名过长' })
  nickname: string

  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  @MaxLength(64, { message: '密码过长' })
  password: string

  @IsOptional()
  @IsEmail({}, { message: '邮箱格式不正确' })
  email?: string

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string

  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1], { message: '状态仅支持 0 禁用 / 1 启用' })
  status?: number

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: '请至少选择一个角色' })
  @IsString({ each: true })
  roleIds?: string[]

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string
}

/** 编辑用户 DTO */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string

  @IsOptional()
  @IsEmail({}, { message: '邮箱格式不正确' })
  email?: string

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string

  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1])
  status?: number

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleIds?: string[]

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string
}

/** 重置密码 DTO */
export class ResetPasswordDto {
  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  @MaxLength(64, { message: '密码过长' })
  password: string
}

/** 修改状态 DTO */
export class UpdateUserStatusDto {
  @Type(() => Number)
  @IsIn([0, 1], { message: '状态仅支持 0 禁用 / 1 启用' })
  status: number
}