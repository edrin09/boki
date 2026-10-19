import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

/** 导入花名册明细行（前端确认后提交） */
export class ImportEmployeeRowDto {
  @IsString()
  @IsOptional()
  @MaxLength(50)
  name: string

  @IsOptional()
  @IsIn(['male', 'female', 'unknown'])
  gender?: string

  /** 用工性质：full_time 全职 / part_time 兼职 */
  @IsOptional()
  @IsIn(['full_time', 'part_time'], { message: '用工性质只能是全职或兼职' })
  employmentType?: string

  /** 部门名称（导入时按名称匹配，不存在自动创建） */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  departmentName?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  position?: string

  @IsOptional()
  @IsString()
  @MaxLength(30)
  idCard?: string

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string

  @IsOptional()
  @IsDateString({}, { message: '入职日期格式不正确' })
  hireDate?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '基本工资最多两位小数' })
  @Min(0)
  baseSalary?: number

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  bankAccount?: string
}

/** 提交导入花名册 */
export class CommitEmployeesImportDto {
  @IsArray({ message: '请至少提供一条员工数据' })
  @ArrayMinSize(1)
  @ArrayMaxSize(500, { message: '单次导入最多 500 条' })
  @ValidateNested({ each: true })
  @Type(() => ImportEmployeeRowDto)
  rows: ImportEmployeeRowDto[]
}
