import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
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
} from 'class-validator'

/** 往来核销 DTO */
export class CreateWriteOffDto {
  @IsIn(['receivable', 'payable'], { message: '核销类型不合法' })
  type: 'receivable' | 'payable'

  @IsString()
  @IsNotEmpty({ message: '请选择往来单位' })
  partnerId: string

  @IsDateString({}, { message: '核销日期格式不正确' })
  bizDate: string

  @IsString()
  @IsNotEmpty({ message: '请选择收付款账户' })
  bankAccountId: string

  /** 应收/应付科目，缺省使用 1122 / 2202 */
  @IsOptional()
  @IsString()
  accountId?: string

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '金额最多两位小数' })
  @Min(0.01, { message: '核销金额必须大于 0' })
  amount: number

  @IsOptional()
  @IsString()
  @MaxLength(200)
  summary?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string

  @IsOptional()
  @IsIn([true, false, 'true', 'false', 1, 0, '1', '0'])
  autoApprove?: boolean | string | number
}

/** 应收应付查询 DTO */
export class QueryArApDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  endPeriod?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  fiscalYear?: number

  /** 指定科目；缺省应收=1122，应付=2202 */
  @IsOptional()
  @IsString()
  accountCode?: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  partnerIds?: string[]

  /** 仅显示有余额的往来单位 */
  @IsOptional()
  @IsIn(['true', 'false', true, false, 1, 0, '1', '0'])
  onlyWithBalance?: string | boolean
}