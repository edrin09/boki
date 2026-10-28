import { Type } from 'class-transformer'
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

/** 新增/编辑固定费用模板 DTO */
export class SaveFixedExpenseDto {
  @IsString()
  @IsNotEmpty({ message: '请填写费用名称' })
  @MaxLength(100, { message: '费用名称最多 100 字' })
  name: string

  @IsIn(['once', 'monthly', 'quarterly', 'yearly'], { message: '频率不合法' })
  frequency: 'once' | 'monthly' | 'quarterly' | 'yearly'

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '金额最多两位小数' })
  @Min(0.01, { message: '金额必须大于 0' })
  amount: number

  /** 费用科目 */
  @IsString()
  @IsNotEmpty({ message: '请选择费用科目' })
  accountId: string

  /** 支付账户，空则默认现金科目 */
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

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: '扣费日最小为 1' })
  @Max(31, { message: '扣费日最大为 31' })
  bizDay?: number

  @IsDateString({}, { message: '生效起始日格式不正确' })
  startDate: string

  @IsOptional()
  @IsDateString({}, { message: '失效日期格式不正确' })
  endDate?: string

  @IsOptional()
  @IsIn([true, false, 'true', 'false', 1, 0, '1', '0'])
  autoApprove?: boolean | string | number

  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1], { message: '状态不合法' })
  status?: number

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string
}
