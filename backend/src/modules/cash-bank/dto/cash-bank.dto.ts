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

/** 新增/编辑现金银行单据 DTO */
export class SaveCashFlowDto {
  @IsIn(['receipt', 'payment', 'transfer', 'expense', 'income'], { message: '单据类型不合法' })
  bizType: 'receipt' | 'payment' | 'transfer' | 'expense' | 'income'

  @IsDateString({}, { message: '业务日期格式不正确' })
  bizDate: string

  @IsString()
  @IsNotEmpty({ message: '请选择资金账户' })
  bankAccountId: string

  /** 对方科目：收付款 / 费用报销 / 其他收入必填；转账不填 */
  @IsOptional()
  @IsString()
  accountId?: string

  /** 转账时的转入账户 */
  @IsOptional()
  @IsString()
  toBankAccountId?: string

  @IsOptional()
  @IsString()
  partnerId?: string

  /** 员工辅助核算（对方科目为其他应收款-员工等带员工辅助的科目时必填） */
  @IsOptional()
  @IsString()
  employeeId?: string

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

  /** 是否生成后直接审核（默认true） */
  @IsOptional()
  @IsIn([true, false, 'true', 'false', 1, 0, '1', '0'])
  autoApprove?: boolean | string | number
}