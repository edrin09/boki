import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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

/** 待确认工作台：修改草稿分录 DTO（改科目/改金额） */
export class UpdateDraftEntryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  summary?: string

  @IsString()
  @IsNotEmpty({ message: '请选择会计科目' })
  accountId: string

  @IsOptional()
  @IsString()
  partnerId?: string

  @IsOptional()
  @IsString()
  departmentId?: string

  @IsOptional()
  @IsString()
  projectId?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  debit?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  credit?: number
}

export class UpdateDraftDto {
  @IsOptional()
  @IsString()
  voucherDate?: string

  @IsArray()
  @ArrayMinSize(2, { message: '凭证分录不足两条' })
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => UpdateDraftEntryDto)
  entries: UpdateDraftEntryDto[]
}

/** 驳回票据 DTO */
export class RejectReceiptDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string
}

/** 修正识别结果 DTO（票据类型 / 进销项方向），仅未入账票据可修正 */
export class UpdateReceiptDto {
  @IsOptional()
  @IsString()
  receiptType?: string

  @IsOptional()
  @IsIn(['input', 'output'], { message: '方向只能是 input（进项）或 output（销项）' })
  direction?: 'input' | 'output'
}

/** 批量确认 DTO */
export class ConfirmBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids: string[]
}

/** 归类规则 DTO */
export class SaveClassifyRuleDto {
  @IsString()
  @IsNotEmpty({ message: '请填写规则名称' })
  @MaxLength(100)
  ruleName: string

  @IsIn(['keyword', 'partner'], { message: '匹配方式不合法' })
  matchType: 'keyword' | 'partner'

  @IsString()
  @IsNotEmpty({ message: '请填写匹配值（关键词或交易对手名称）' })
  @MaxLength(300)
  matchValue: string

  @IsIn(['expense', 'income'], { message: '凭证模板类型不合法' })
  kind: 'expense' | 'income'

  @IsString()
  @IsNotEmpty({ message: '请填写目标科目编码' })
  @MaxLength(20)
  targetAccountCode: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number

  @IsOptional()
  @IsIn([0, 1])
  enabled?: number
}

/** 规则启停 DTO */
export class ToggleRuleDto {
  @IsIn([0, 1])
  enabled: number
}
