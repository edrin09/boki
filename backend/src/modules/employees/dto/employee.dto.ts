import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

/** 新增员工 DTO */
export class CreateEmployeeDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string

  @IsString()
  @IsNotEmpty({ message: '请输入姓名' })
  @MaxLength(50)
  name: string

  @IsOptional()
  @IsIn(['male', 'female', 'unknown'])
  gender?: string

  @IsOptional()
  @IsIn(['full_time', 'part_time'], { message: '用工性质只能是全职或兼职' })
  employmentType?: string

  @IsOptional()
  @IsString()
  departmentId?: string

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
  @IsEmail({}, { message: '邮箱格式不正确' })
  email?: string

  @IsOptional()
  @IsDateString({}, { message: '入职日期格式不正确' })
  hireDate?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '基本工资最多两位小数' })
  @Min(0, { message: '基本工资不能为负数' })
  baseSalary?: number

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  bankAccount?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  status?: number

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string
}

/** 批量新增员工（证件一键录入） */
export class BatchCreateEmployeeDto {
  @IsArray()
  @ArrayNotEmpty({ message: '请至少提供一条员工数据' })
  @ArrayMaxSize(50, { message: '单次批量新增最多 50 条' })
  @ValidateNested({ each: true })
  @Type(() => CreateEmployeeDto)
  items: CreateEmployeeDto[]
}

/** 编辑员工 DTO */
export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string

  @IsOptional()
  @IsIn(['male', 'female', 'unknown'])
  gender?: string

  @IsOptional()
  @IsIn(['full_time', 'part_time'], { message: '用工性质只能是全职或兼职' })
  employmentType?: string

  @IsOptional()
  @IsString()
  departmentId?: string

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
  @IsEmail({}, { message: '邮箱格式不正确' })
  email?: string

  @IsOptional()
  @IsDateString({}, { message: '入职日期格式不正确' })
  hireDate?: string

  @IsOptional()
  @IsDateString({}, { message: '离职日期格式不正确' })
  leaveDate?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  status?: number

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string
}