import { Type } from 'class-transformer'
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

/**
 * 首次建账（创建系统中第一家记账公司）。
 *
 * 公司档案的完整管理（编辑、删除、成员授权、多公司新建）由
 * multi-company 插件提供；内核只保留「零插件也能建账」所需的最小入口。
 */
export class BootstrapCompanyDto {
  @IsString({ message: '公司名称不能为空' })
  @Length(1, 100, { message: '公司名称长度 1-100' })
  name: string

  @IsOptional()
  @IsString()
  @Length(1, 30, { message: '公司编码长度 1-30' })
  code?: string

  @IsString({ message: '请填写纳税人识别号' })
  @Length(1, 50, { message: '纳税人识别号长度 1-50' })
  taxNo: string

  @IsIn(['small_scale', 'general'], { message: '纳税人类型只能是 small_scale 或 general' })
  taxpayerType: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: '增值税征收率必须是数字' })
  @Min(0, { message: '增值税征收率不能为负' })
  @Max(100, { message: '增值税征收率不能超过 100' })
  vatRate?: number

  @IsOptional()
  @IsIn(['month', 'quarter'], { message: '申报周期只能是 month 或 quarter' })
  taxDeclareCycle?: string

  @IsOptional()
  @IsString()
  @Length(1, 50)
  legalPerson?: string

  @IsOptional()
  @IsString()
  @Length(1, 50)
  industry?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string

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
  @Min(1)
  @Max(12)
  fiscalStartMonth?: number

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string
}
