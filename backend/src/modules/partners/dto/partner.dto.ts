import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator'

/** 往来单位公共字段（税号单独定义：新增/编辑必填，批量证件识别可空） */
class PartnerFieldsDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string

  @IsString()
  @IsNotEmpty({ message: '请输入名称' })
  @MaxLength(100)
  name: string

  @IsOptional()
  @IsIn(['customer', 'supplier', 'both'], { message: '类型不合法' })
  type?: 'customer' | 'supplier' | 'both'

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contact?: string

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  email?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  legalPerson?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  bankAccount?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string
}

/** 新增往来单位 DTO（纳税人识别号必填） */
export class CreatePartnerDto extends PartnerFieldsDto {
  @IsString()
  @IsNotEmpty({ message: '请输入纳税人识别号' })
  @MaxLength(50)
  taxNo: string
}

/** 批量新增条目 DTO（证件一键录入，识别不到税号时允许为空） */
export class BatchPartnerItemDto extends PartnerFieldsDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxNo?: string
}

/** 编辑往来单位 DTO */
export class UpdatePartnerDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string

  @IsOptional()
  @IsIn(['customer', 'supplier', 'both'])
  type?: 'customer' | 'supplier' | 'both'

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contact?: string

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  email?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string

  @IsString()
  @IsNotEmpty({ message: '请输入纳税人识别号' })
  @MaxLength(50)
  taxNo: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  legalPerson?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  bankAccount?: string

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

/** 批量新增往来单位（证件一键录入） */
export class BatchCreatePartnerDto {
  @IsArray()
  @ArrayNotEmpty({ message: '请至少提供一条往来单位数据' })
  @ArrayMaxSize(50, { message: '单次批量新增最多 50 条' })
  @ValidateNested({ each: true })
  @Type(() => BatchPartnerItemDto)
  items: BatchPartnerItemDto[]
}