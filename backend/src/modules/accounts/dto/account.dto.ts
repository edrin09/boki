import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

/** 新增会计科目 DTO（code 留空时后端自动生成） */
export class CreateAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[0-9A-Za-z.\_-]+$/, { message: '科目编码只能包含数字、字母、点、下划线和中划线' })
  code?: string

  @IsString()
  @IsNotEmpty({ message: '请输入科目名称' })
  @MaxLength(100)
  name: string

  @IsOptional()
  @IsString()
  parentId?: string

  @IsOptional()
  @IsIn(['asset', 'liability', 'equity', 'cost', 'profit'], { message: '科目类别不合法' })
  category?: 'asset' | 'liability' | 'equity' | 'cost' | 'profit'

  @IsOptional()
  @IsIn(['debit', 'credit'], { message: '余额方向不合法' })
  direction?: 'debit' | 'credit'

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsIn(['partner', 'department', 'project'], { each: true })
  auxiliaryTypes?: string[]

  @IsOptional()
  @IsBoolean()
  isCash?: boolean

  @IsOptional()
  @IsBoolean()
  isBank?: boolean

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sort?: number

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string
}

/** 编辑会计科目 DTO */
export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string

  @IsOptional()
  @IsIn(['debit', 'credit'])
  direction?: 'debit' | 'credit'

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsIn(['partner', 'department', 'project'], { each: true })
  auxiliaryTypes?: string[]

  @IsOptional()
  @IsBoolean()
  isCash?: boolean

  @IsOptional()
  @IsBoolean()
  isBank?: boolean

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sort?: number

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string
}

/** 启用禁用 DTO */
export class UpdateAccountStatusDto {
  @Type(() => Number)
  @IsIn([0, 1], { message: '状态仅支持 0 禁用 / 1 启用' })
  status: number
}