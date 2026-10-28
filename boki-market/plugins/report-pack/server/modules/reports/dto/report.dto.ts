import { Type } from 'class-transformer'
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

/** 报表查询 DTO */
export class ReportQueryDto {
  /** 期末期间（资产负债表时点 / 利润表截止期间） */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '期间不合法' })
  endPeriod?: number

  /** 起始期间（利润表本期起始，缺省等于 endPeriod） */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '期间不合法' })
  startPeriod?: number

  /** 会计年度 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2999)
  fiscalYear?: number

  /** 是否包含未审核凭证（仅调试用，默认否） */
  @IsOptional()
  @IsBoolean()
  includeUnapproved?: boolean

  /** 票据类型过滤（票据台账） */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  receiptType?: string

  /** 关键词过滤（票据台账） */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string
}