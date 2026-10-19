import { IsArray, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator'

/**
 * 报销单 / 借款单批量导出 PDF（原始凭证存根）
 * ids 优先；未传 ids 时按筛选条件导出全部。
 */
export class HrPdfPackageDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(1, 36, { each: true })
  ids?: string[]

  @IsOptional()
  @IsIn(['draft', 'approved', 'paid', 'rejected', 'repaid'])
  status?: string

  @IsOptional()
  @IsString()
  @MaxLength(36)
  employeeId?: string

  @IsOptional()
  @IsString()
  @Length(10, 10, { message: 'startDate 格式应为 YYYY-MM-DD' })
  startDate?: string

  @IsOptional()
  @IsString()
  @Length(10, 10, { message: 'endDate 格式应为 YYYY-MM-DD' })
  endDate?: string
}

/** 工资表批量导出 PDF */
export class PayrollPdfPackageDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(1, 36, { each: true })
  ids?: string[]

  @IsOptional()
  @IsIn(['draft', 'approved', 'paid'])
  status?: string

  @IsOptional()
  @IsInt()
  @Min(200001)
  startPeriod?: number

  @IsOptional()
  @IsInt()
  @Max(299912)
  endPeriod?: number
}
