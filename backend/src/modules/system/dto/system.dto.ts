import { Type } from 'class-transformer'
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'

/** 恢复数据库 DTO */
export class RestoreBackupDto {
  /** 上传的备份文件名 */
  @IsString()
  @MaxLength(200)
  filename: string

  /** 二次确认标识，必须为 true */
  @IsIn([true, 'true', 1, '1'])
  confirm: boolean | string | number
}

/** 清理日志 DTO */
export class CleanLogsDto {
  /** 保留天数 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  keepDays?: number
}

/** 导入基础数据 DTO */
export class DemoDataQueryDto {
  @IsOptional()
  @IsIn(['true', 'false', true, false, 1, 0, '1', '0'])
  reset?: string | boolean
}