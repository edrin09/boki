import { IsInt, IsOptional, IsString, Matches } from 'class-validator'
import { Type } from 'class-transformer'

/** 期末结转查询参数 */
export class ClosingQueryDto {
  /** 会计期间 YYYYMM，缺省为当前期间 */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '会计期间不合法' })
  period?: number
}

/** 执行结转参数 */
export class ClosingExecuteDto {
  @Type(() => Number)
  @IsInt({ message: '会计期间不合法' })
  period: number

  /** 结转凭证日期，缺省为期间最后一天 */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '凭证日期格式应为 YYYY-MM-DD' })
  voucherDate?: string

  /** 备注（可选，追加到凭证说明） */
  @IsOptional()
  @IsString()
  remark?: string
}
