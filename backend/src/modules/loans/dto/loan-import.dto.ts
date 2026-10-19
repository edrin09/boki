import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

/** 导入借款单明细行（前端确认后提交） */
export class ImportLoanRowDto {
  /** 模板单号（可选；为空或重复时后端自动生成） */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  loanNo?: string

  @IsString()
  @IsNotEmpty({ message: '请选择借款人' })
  employeeId: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  employeeName?: string

  @IsDateString({}, { message: '借款日期格式不正确' })
  loanDate: string

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '借款金额最多两位小数' })
  @Min(0.01, { message: '借款金额必须大于 0' })
  amount: number

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string

  @IsIn(['cash', 'bank'], { message: '借款方式不合法' })
  payMethod: 'cash' | 'bank'
}

/** 提交导入：生成借款单草稿 */
export class CommitLoansImportDto {
  @IsArray({ message: '请至少导入一张借款单' })
  @ArrayMinSize(1)
  @ArrayMaxSize(500, { message: '单次导入最多 500 条' })
  @ValidateNested({ each: true })
  @Type(() => ImportLoanRowDto)
  rows: ImportLoanRowDto[]
}
