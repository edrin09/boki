import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common'
import type { Request } from 'express'
import { ArApService } from './ar-ap.service'
import { CreateWriteOffDto, QueryArApDto } from './dto/ar-ap.dto'
import { PaginationQueryDto } from '@core/common/dto/pagination.dto'
import { RequirePermissions } from '@core/common/decorators/permissions.decorator'
import { Operation } from '@core/common/decorators/operation.decorator'
import { getCurrentUser } from '@core/common/utils/request.util'

@Controller('ar-ap')
export class ArApController {
  constructor(private readonly arApService: ArApService) {}

  @Get('receivable')
  @RequirePermissions('ar-ap')
  @Operation('查询应收往来余额')
  receivable(@Query() query: QueryArApDto, @Query('partnerIds') partnerIds?: string) {
    return this.arApService.receivable({ ...query, partnerIds: parseList(partnerIds) })
  }

  @Get('payable')
  @RequirePermissions('ar-ap')
  @Operation('查询应付往来余额')
  payable(@Query() query: QueryArApDto, @Query('partnerIds') partnerIds?: string) {
    return this.arApService.payable({ ...query, partnerIds: parseList(partnerIds) })
  }

  @Get('write-offs')
  @RequirePermissions('ar-ap')
  @Operation('查询核销记录')
  findWriteOffs(@Query() query: PaginationQueryDto, @Query('type') type?: string) {
    return this.arApService.findWriteOffs({ ...query, type })
  }

  @Post('write-off')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ar-ap:write-off')
  @Operation('往来核销')
  createWriteOff(@Body() dto: CreateWriteOffDto, @Req() req: Request) {
    const user = getCurrentUser(req)
    const v = dto.autoApprove
    const autoApprove = v === undefined ? true : !(v === false || v === 0 || v === 'false' || v === '0')
    return this.arApService.createWriteOff(dto, { id: user.sub, nickname: user.nickname }, autoApprove)
  }

  @Delete('write-off/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('ar-ap:write-off')
  @Operation('撤销核销')
  removeWriteOff(@Param('id', ParseUUIDPipe) id: string) {
    return this.arApService.removeWriteOff(id)
  }
}

function parseList(value?: string): string[] | undefined {
  if (!value) return undefined
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}