import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator'

/** 新增角色 DTO */
export class CreateRoleDto {
  @IsString()
  @IsNotEmpty({ message: '请输入角色标识' })
  @MaxLength(50)
  code: string

  @IsString()
  @IsNotEmpty({ message: '请输入角色名称' })
  @MaxLength(50)
  name: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string

  @IsOptional()
  @Type(() => Number)
  sort?: number

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionIds?: string[]
}

/** 编辑角色 DTO */
export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string

  @IsOptional()
  @Type(() => Number)
  sort?: number

  @IsOptional()
  @IsBoolean()
  status?: boolean
}

/** 分配权限 DTO */
export class AssignPermissionsDto {
  @IsArray({ message: '请传入权限ID数组' })
  @IsString({ each: true })
  permissionIds: string[]
}