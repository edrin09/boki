import { Type } from 'class-transformer'
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'

/** 新增部门 DTO */
export class CreateDepartmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string

  @IsString()
  @IsNotEmpty({ message: '请输入部门名称' })
  @MaxLength(100)
  name: string

  @IsOptional()
  @IsString()
  parentId?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  manager?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string
}

/** 编辑部门 DTO */
export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string

  @IsOptional()
  @IsString()
  parentId?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  manager?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  status?: number
}