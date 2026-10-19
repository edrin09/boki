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

/** 导入报销单明细行（前端确认后提交） */
export class ImportClaimRowDto {
  /** 模板单号（可选；为空或重复时后端自动生成） */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  claimNo?: string

  @IsString()
  @IsNotEmpty({ message: '请选择报销人' })
  employeeId: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  employeeName?: string

  @IsDateString({}, { message: '报销日期格式不正确' })
  claimDate: string

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '报销金额最多两位小数' })
  @Min(0.01, { message: '报销金额必须大于 0' })
  amount: number

  @IsIn(['advance', 'cash', 'bank'], { message: '支付方式不合法' })
  payMethod: 'advance' | 'cash' | 'bank'

  @IsOptional()
  @IsString()
  @MaxLength(200)
  summary?: string
}

/** 提交导入：生成报销单草稿（单明细行，费用科目默认管理费用） */
export class CommitClaimsImportDto {
  @IsArray({ message: '请至少导入一张报销单' })
  @ArrayMinSize(1)
  @ArrayMaxSize(500, { message: '单次导入最多 500 条' })
  @ValidateNested({ each: true })
  @Type(() => ImportClaimRowDto)
  rows: ImportClaimRowDto[]
}
