import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

/** 凭证分录 DTO */
export class VoucherEntryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  summary?: string

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
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '借方金额最多两位小数' })
  @Min(0, { message: '借方金额不能为负数' })
  debit?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '贷方金额最多两位小数' })
  @Min(0, { message: '贷方金额不能为负数' })
  credit?: number
}

/** 新增/编辑凭证 DTO */
export class SaveVoucherDto {
  @IsString()
  @IsNotEmpty({ message: '请选择凭证字' })
  @MaxLength(10)
  word: string

  @IsDateString({}, { message: '凭证日期格式不正确' })
  voucherDate: string

  @IsArray({ message: '请至少录入两条分录' })
  @ArrayMinSize(2, { message: '记账凭证至少需要两条分录' })
  @ArrayMaxSize(200, { message: '单张凭证分录过多' })
  @ValidateNested({ each: true })
  @Type(() => VoucherEntryDto)
  entries: VoucherEntryDto[]

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  attachments?: number

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string

  /** 提交时直接审核通过（可选） */
  @IsOptional()
  @IsIn([true, false, 'true', 'false', 1, 0, '1', '0'])
  approveNow?: boolean | string | number
}

/** 红字冲销 DTO */
export class ReverseVoucherDto {
  @IsOptional()
  @IsDateString({}, { message: '红冲日期格式不正确' })
  reversalDate?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string
}