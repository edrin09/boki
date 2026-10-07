import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsInt, IsOptional } from 'class-validator'
import { ToArray } from '../../../common/decorators/to-array.decorator'

/** 账簿通用查询 DTO */
export class BooksQueryDto {
  /** 起始期间 YYYYMM */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '起始期间不合法' })
  startPeriod?: number

  /** 结束期间 YYYYMM */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '结束期间不合法' })
  endPeriod?: number

  /** 会计年度（期初余额所属年度） */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  fiscalYear?: number

  /** 指定科目（含下级汇总），支持逗号分隔 */
  @IsOptional()
  @ToArray()
  @IsArray()
  accountIds?: string[]

  /** 科目编码，支持逗号分隔 */
  @IsOptional()
  @ToArray()
  @IsArray()
  accountCodes?: string[]

  /** 是否包含未审核凭证 */
  @IsOptional()
  @IsBoolean()
  includeUnapproved?: boolean
}

/** 总账 / 明细账查询 DTO */
export class LedgerQueryDto extends BooksQueryDto {
  /** 往来单位过滤 */
  @IsOptional()
  @ToArray()
  @IsArray()
  partnerIds?: string[]

  /** 部门过滤 */
  @IsOptional()
  @ToArray()
  @IsArray()
  departmentIds?: string[]

  /** 项目过滤 */
  @IsOptional()
  @ToArray()
  @IsArray()
  projectIds?: string[]
}