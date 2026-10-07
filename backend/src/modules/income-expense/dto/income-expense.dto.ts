import { Type } from 'class-transformer'
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator'

/** 新增/编辑其他收支单据 DTO */
export class SaveIncomeExpenseDto {
  @IsIn(['income', 'expense'], { message: '类型不合法' })
  bizType: 'income' | 'expense'

  @IsDateString({}, { message: '业务日期格式不正确' })
  bizDate: string

  /** 收入/费用科目 */
  @IsString()
  @IsNotEmpty({ message: '请选择会计科目' })
  accountId: string

  /** 收付款账户 */
  @IsOptional()
  @IsString()
  bankAccountId?: string

  @IsOptional()
  @IsString()
  partnerId?: string

  @IsOptional()
  @IsString()
  departmentId?: string

  @IsOptional()
  @IsString()
  projectId?: string

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '金额最多两位小数' })
  @Min(0.01, { message: '金额必须大于 0' })
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