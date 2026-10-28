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

/** 新增/编辑借款单 DTO */
export class SaveLoanDto {
  /** 借款单号（可选；缺省或重复时由后端自动生成） */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  loanNo?: string

  @IsDateString({}, { message: '借款日期格式不正确' })
  loanDate: string

  @IsString()
  @IsNotEmpty({ message: '请选择借款人' })
  employeeId: string

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

  /** 放款资金账户（payMethod 为 bank 时建议填写） */
  @IsOptional()
  @IsString()
  bankAccountId?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string
}

/** 还款 DTO */
export class RepayLoanDto {
  /** 本次还款金额（可选，缺省 = 剩余欠款全额还清） */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '还款金额最多两位小数' })
  @Min(0.01, { message: '还款金额必须大于 0' })
  amount?: number

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: '请选择回款账户' })
  bankAccountId?: string

  @IsIn(['cash', 'bank'], { message: '还款方式不合法' })
  repayMethod: 'cash' | 'bank'

  @IsOptional()
  @IsDateString({}, { message: '还款日期格式不正确' })
  repayDate?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string
}

/** 驳回 DTO */
export class RejectLoanDto {
  @IsString()
  @IsNotEmpty({ message: '请填写驳回原因' })
  @MaxLength(200)
  reason: string
}
