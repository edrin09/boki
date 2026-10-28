import { Type } from 'class-transformer'
import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator'

export class RecognizeOptionsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(320)
  @Max(2560)
  detMaxSide?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(0.9)
  detThresh?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(0.95)
  boxThresh?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(3)
  unclipRatio?: number

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  useAngleCls?: boolean
}