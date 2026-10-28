import { Type } from 'class-transformer'
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator'

/** 新增项目 DTO */
export class CreateProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string

  @IsString()
  @IsNotEmpty({ message: '请输入项目名称' })
  @MaxLength(100)
  name: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  manager?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contractNo?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '合同金额最多两位小数' })
  @Min(0)
  contractAmount?: number

  @IsOptional()
  @IsString()
  @MaxLength(36)
  partnerId?: string

  @IsOptional()
  @IsDateString({}, { message: '开始日期格式不正确' })
  startDate?: string

  @IsOptional()
  @IsDateString({}, { message: '结束日期格式不正确' })
  endDate?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string
}

/** 编辑项目 DTO */
export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  manager?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contractNo?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '合同金额最多两位小数' })
  @Min(0)
  contractAmount?: number

  @IsOptional()
  @IsString()
  @MaxLength(36)
  partnerId?: string

  @IsOptional()
  @IsDateString({}, { message: '开始日期格式不正确' })
  startDate?: string

  @IsOptional()
  @IsDateString({}, { message: '结束日期格式不正确' })
  endDate?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  status?: number
}