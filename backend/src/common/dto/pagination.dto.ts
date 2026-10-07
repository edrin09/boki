import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

/**
 * 通用分页查询 DTO
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page 必须为整数' })
  @Min(1)
  page = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize 必须为整数' })
  @Min(1)
  @Max(500)
  pageSize = 20

  /** 关键字模糊搜索 */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string

  /** 排序字段（白名单由各 Service 校验） */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sortBy?: string

  /** 排序方向 */
  @IsOptional()
  @IsIn(['ASC', 'DESC', 'asc', 'desc'])
  sortOrder?: 'ASC' | 'DESC' | 'asc' | 'desc'

  /** 起始日期 */
  @IsOptional()
  @IsString()
  startDate?: string

  /** 结束日期 */
  @IsOptional()
  @IsString()
  endDate?: string
}

/**
 * 分页响应结构
 */
export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}