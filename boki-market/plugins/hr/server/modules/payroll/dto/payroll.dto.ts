import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

/** 工资明细行 DTO */
export class PayrollItemDto {
  @IsString()
  @IsNotEmpty({ message: '请选择员工' })
  employeeId: string

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: '基本工资不能为负数' })
  baseSalary: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  performance?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  allowance?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  overtime?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  insurancePersonal?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fundPersonal?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  tax?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  otherDeduct?: number

  /** 借款扣回（从工资扣回员工借款） */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  loanDeduct?: number

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string
}

/** 生成/保存工资单 DTO */
export class SavePayrollDto {
  @Type(() => Number)
  @IsInt({ message: '工资期间不合法' })
  @Min(190001, { message: '工资期间不合法' })
  period: number

  @IsDateString({}, { message: '发放日期格式不正确' })
  payDate: string

  /** 费用科目（计提工资用） */
  @IsOptional()
  @IsString()
  expenseAccountId?: string

  /** 应付职工薪酬-工资 */
  @IsOptional()
  @IsString()
  payableAccountId?: string

  /** 其他应付款（代扣社保/公积金） */
  @IsOptional()
  @IsString()
  deductAccountId?: string

  /** 应交税费-应交个人所得税 */
  @IsOptional()
  @IsString()
  taxAccountId?: string

  /** 发放资金账户 */
  @IsOptional()
  @IsString()
  bankAccountId?: string

  @IsArray({ message: '请至少录入一名员工的工资' })
  @ArrayMinSize(1, { message: '请至少录入一名员工的工资' })
  @ArrayMaxSize(500, { message: '单张工资单员工过多' })
  @ValidateNested({ each: true })
  @Type(() => PayrollItemDto)
  items: PayrollItemDto[]

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string
}

/** 按在职员工生成草稿 DTO */
export class GeneratePayrollDto {
  @Type(() => Number)
  @IsInt({ message: '工资期间不合法' })
  @Min(190001, { message: '工资期间不合法' })
  period: number

  @IsDateString({}, { message: '发放日期格式不正确' })
  payDate: string

  /** 指定部门（不填则取全部在职员工） */
  @IsOptional()
  @IsString()
  departmentId?: string
}

/** 发放工资 DTO */
export class PayPayrollDto {
  @IsOptional()
  @IsString()
  bankAccountId?: string

  @IsOptional()
  @IsString()
  payDate?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string
}