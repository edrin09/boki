import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common'
import type { Request } from 'express'
import { VouchersService } from './vouchers.service'
import { SaveVoucherDto, ReverseVoucherDto } from './dto/voucher.dto'
import { PaginationQueryDto } from '../../common/dto/pagination.dto'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { Operation } from '../../common/decorators/operation.decorator'
import { getCurrentUser } from '../../common/utils/request.util'

@Controller('vouchers')
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Get()
  @RequirePermissions('voucher:list')
  @Operation('查询凭证列表')
  findAll(
    @Query() query: PaginationQueryDto,
    @Query('period') period?: string,
    @Query('status') status?: string,
    @Query('word') word?: string,
    @Query('accountId') accountId?: string,
    @Query('startPeriod') startPeriod?: string,
    @Query('endPeriod') endPeriod?: string,
  ) {
    return this.vouchersService.findAll({
      ...query,
      period: period ? Number(period) : undefined,
      status,
      word,
      accountId,
      startPeriod: startPeriod ? Number(startPeriod) : undefined,
      endPeriod: endPeriod ? Number(endPeriod) : undefined,
    })
  }

  @Get('next-no')
  @RequirePermissions('voucher:list', 'voucher:create')
  @Operation('获取下一个凭证号')
  nextNo(
    @Query('period', ParseIntPipe) period: number,
    @Query('word') word?: string,
  ) {
    return this.vouchersService.getNextVoucherNo(period, word || '记')
  }

  @Get(':id')
  @RequirePermissions('voucher:list')
  @Operation('查询凭证详情')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vouchersService.findOne(id)
  }

  @Get(':id/copy')
  @RequirePermissions('voucher:list', 'voucher:create')
  @Operation('复制凭证（返回新建草稿数据）')
  copy(@Param('id', ParseUUIDPipe) id: string) {
    return this.vouchersService.copyPayload(id)
  }

  @Post(':id/reverse')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('voucher:reverse')
  @Operation('红字冲销凭证')
  reverse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseVoucherDto,
    @Req() req: Request,
  ) {
    const user = getCurrentUser(req)
    return this.vouchersService.reverse(id, dto, { id: user.sub, nickname: user.nickname })
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('voucher:create')
  @Operation('新增凭证')
  create(@Body() dto: SaveVoucherDto, @Req() req: Request) {
    const user = getCurrentUser(req)
    return this.vouchersService.create(dto, { id: user.sub, nickname: user.nickname }, this.isApproveNow(dto))
  }

  @Put(':id')
  @RequirePermissions('voucher:update')
  @Operation('编辑凭证')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveVoucherDto,
    @Req() req: Request,
  ) {
    const user = getCurrentUser(req)
    return this.vouchersService.update(id, dto, { id: user.sub, nickname: user.nickname }, this.isApproveNow(dto))
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('voucher:approve')
  @Operation('审核凭证')
  approve(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const user = getCurrentUser(req)
    return this.vouchersService.approve(id, { id: user.sub, nickname: user.nickname })
  }

  @Post(':id/unapprove')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('voucher:unapprove')
  @Operation('反审核凭证')
  unapprove(@Param('id', ParseUUIDPipe) id: string) {
    return this.vouchersService.unapprove(id)
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('voucher:cancel')
  @Operation('作废凭证')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body('reason') reason?: string) {
    return this.vouchersService.cancel(id, reason)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('voucher:delete')
  @Operation('删除凭证')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.vouchersService.remove(id)
  }

  private isApproveNow(dto: SaveVoucherDto): boolean {
    const v = dto.approveNow
    return v === true || v === 1 || v === 'true' || v === '1'
  }
}