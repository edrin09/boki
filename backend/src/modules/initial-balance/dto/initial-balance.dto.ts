import { Type } from 'class-transformer'
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

/** 录入/修改期初余额 DTO */
export class SaveInitialBalanceDto {
  @Type(() => Number)
  @IsInt({ message: '会计年度必须为整数' })
  @Min(1900, { message: '会计年度不合法' })
  @Max(2999, { message: '会计年度不合法' })
  fiscalYear: number

  @IsString()
  @IsNotEmpty({ message: '请选择会计科目' })
  accountId: string

  @IsOptional()
  @IsString()
  partnerId?: string

  @IsOptional()
  @IsString()
  departmentId?: string

  @IsOptional()
  @IsString()
  projectId?: string

  @IsOptional()
  @IsString()
  employeeId?: string

  @IsIn(['debit', 'credit'], { message: '余额方向不合法' })
  direction: 'debit' | 'credit'

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '金额最多两位小数' })
  @Min(0, { message: '金额不能为负数' })
  amount: number

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string
}

/** 批量保存期初余额明细（会计年度由外层 fiscalYear 统一提供） */
export class BatchInitialBalanceItemDto {
  @IsString()
  @IsNotEmpty({ message: '请选择会计科目' })
  accountId: string

  @IsOptional()
  @IsString()
  partnerId?: string

  @IsOptional()
  @IsString()
  departmentId?: string

  @IsOptional()
  @IsString()
  projectId?: string

  @IsOptional()
  @IsString()
  employeeId?: string

  @IsIn(['debit', 'credit'], { message: '余额方向不合法' })
  direction: 'debit' | 'credit'

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '金额最多两位小数' })
  @Min(0, { message: '金额不能为负数' })
  amount: number

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string
}

/** 批量保存期初余额 DTO */
export class BatchSaveInitialBalanceDto {
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2999)
  fiscalYear: number

  @IsArray({ message: '请提供期初余额明细' })
  @ValidateNested({ each: true })
  @Type(() => BatchInitialBalanceItemDto)
  items: BatchInitialBalanceItemDto[]
}