import { Type } from 'class-transformer'
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator'

/** 新增资金账户 DTO */
export class CreateBankDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string

  @IsString()
  @IsNotEmpty({ message: '请输入账户名称' })
  @MaxLength(100)
  name: string

  @IsOptional()
  @IsIn(['cash', 'bank'], { message: '类型不合法' })
  type?: 'cash' | 'bank'

  @IsOptional()
  @IsString()
  @MaxLength(20)
  accountCode?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  accountNo?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  accountName?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string
}

/** 编辑资金账户 DTO */
export class UpdateBankDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string

  @IsOptional()
  @IsIn(['cash', 'bank'])
  type?: 'cash' | 'bank'

  @IsOptional()
  @IsString()
  @MaxLength(20)
  accountCode?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  accountNo?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  accountName?: string

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