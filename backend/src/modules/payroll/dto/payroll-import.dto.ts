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

/** 导入工资明细行（前端确认后提交） */
export class ImportPayrollItemDto {
  @IsString()
  @IsNotEmpty({ message: '请选择员工' })
  employeeId: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  employeeName?: string

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
}

/** 提交导入：生成工资单草稿 */
export class CommitPayrollImportDto {
  @Type(() => Number)
  @IsInt({ message: '工资期间不合法' })
  @Min(190001, { message: '工资期间不合法' })
  period: number

  @IsDateString({}, { message: '发放日期格式不正确' })
  payDate: string

  @IsArray({ message: '请至少导入一名员工的工资' })
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ImportPayrollItemDto)
  rows: ImportPayrollItemDto[]

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string
}
