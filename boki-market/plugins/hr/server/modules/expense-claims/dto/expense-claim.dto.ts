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

/** 报销费用行 DTO */
export class ExpenseClaimItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  summary?: string

  /** 未指定时使用主表上的默认费用科目 */
  @IsOptional()
  @IsString()
  accountId?: string

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '金额最多两位小数' })
  @Min(0.01, { message: '金额必须大于 0' })
  amount: number

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string
}

/** 新增/编辑报销单 DTO */
export class SaveExpenseClaimDto {
  /** 报销单号（可选；缺省或重复时由后端自动生成） */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  claimNo?: string

  @IsDateString({}, { message: '报销日期格式不正确' })
  claimDate: string

  @IsString()
  @IsNotEmpty({ message: '请选择报销人' })
  employeeId: string

  @IsIn(['advance', 'cash', 'bank'], { message: '支付方式不合法' })
  payMethod: 'advance' | 'cash' | 'bank'

  /** 付款资金账户（payMethod 为 cash/bank 时必填） */
  @IsOptional()
  @IsString()
  bankAccountId?: string

  /** 抵充的借款单ID（员工用借款去报销时选择；冲抵型不指定时按借款日期先后FIFO冲抵） */
  @IsOptional()
  @IsString()
  loanId?: string

  /** 报销单类型：loan_offset 冲抵借款 / payment 直接付款（缺省按是否指定借款单推导） */
  @IsOptional()
  @IsIn(['loan_offset', 'payment'], { message: '报销单类型不合法' })
  claimType?: 'loan_offset' | 'payment'

  @IsArray({ message: '请至少录入一条费用明细' })
  @ArrayMinSize(1, { message: '请至少录入一条费用明细' })
  @ArrayMaxSize(100, { message: '明细行过多' })
  @ValidateNested({ each: true })
  @Type(() => ExpenseClaimItemDto)
  items: ExpenseClaimItemDto[]

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string
}

/** 付款 DTO */
export class PayExpenseClaimDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: '请选择付款账户' })
  bankAccountId?: string

  @IsOptional()
  @IsString()
  payDate?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string
}

/** 驳回 DTO */
export class RejectExpenseClaimDto {
  @IsString()
  @IsNotEmpty({ message: '请填写驳回原因' })
  @MaxLength(200)
  reason: string
}