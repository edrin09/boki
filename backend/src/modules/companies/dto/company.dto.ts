import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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

/** 新建公司 */
export class CreateCompanyDto {
  @IsString({ message: '公司名称不能为空' })
  @Length(1, 100, { message: '公司名称长度 1-100' })
  name: string

  @IsOptional()
  @IsString()
  @Length(1, 30, { message: '公司编码长度 1-30' })
  code?: string

  /** 纳税人识别号：新建时必填 —— 用于比对票面购销方、判定进项/销项方向 *//** 纳税人识别号：新建时必填 —— 用于比对票面购销方、判定进项/销项方向 */
  @IsString({ message: '请填写纳税人识别号' })
  @Length(1, 50, { message: '纳税人识别号长度 1-50' })
  taxNo: string

  /** 纳税人类型：新建时必须选择 —— 决定增值税记账口径（小规模纳税人进项不可抵扣） */
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
  @Type(() => Number)
  @IsNumber({}, { message: '自动记账阈值必须是数字' })
  @Min(0, { message: '阈值不能小于 0' })
  @Max(1, { message: '阈值不能大于 1' })
  autoPostThreshold?: number

  @IsOptional()
  @IsInt()
  @IsIn([0, 1], { message: '自动记账开关只能是 0 或 1' })
  autoPostEnabled?: number

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

  /** 是否同时把当前用户加入该公司（默认加入，创建者） */
  @IsOptional()
  @IsBoolean()
  joinCurrentUser?: boolean

  /** 复制当前公司的会计科目作为初始科目表（默认开启） */
  @IsOptional()
  @IsBoolean()
  copyAccountsFromCurrent?: boolean
}

/** 编辑公司 */
export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string

  @IsOptional()
  @IsString()
  @Length(1, 30)
  code?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxNo?: string

  @IsOptional()
  @IsIn(['small_scale', 'general'], { message: '纳税人类型只能是 small_scale 或 general' })
  taxpayerType?: string

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
  @Type(() => Number)
  @IsNumber({}, { message: '自动记账阈值必须是数字' })
  @Min(0, { message: '阈值不能小于 0' })
  @Max(1, { message: '阈值不能大于 1' })
  autoPostThreshold?: number

  @IsOptional()
  @IsInt()
  @IsIn([0, 1], { message: '自动记账开关只能是 0 或 1' })
  autoPostEnabled?: number

  @IsOptional()
  @IsString()
  @MaxLength(50)
  legalPerson?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
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
  @Type(() => Number)
  @IsIn([0, 1])
  status?: number

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string
}

/** 切换公司 */
export class SwitchCompanyDto {
  @IsString({ message: '请选择公司' })
  companyId: string
}

/** 成员授权 */
export class AddCompanyMemberDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  userIds?: string[]
}

/** 授权时可同时指定角色 */
export class SetCompanyMemberDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  userIds: string[]

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  roleIds?: string[]
}