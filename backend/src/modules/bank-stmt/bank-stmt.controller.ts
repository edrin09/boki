import {
  BadRequestException,
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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Request } from 'express'
import { BankStmtService, Operator } from './bank-stmt.service'
import { PaginationQueryDto } from '../../common/dto/pagination.dto'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { Operation } from '../../common/decorators/operation.decorator'
import { getCurrentUser } from '../../common/utils/request.util'

@Controller('bank-stmt')
export class BankStmtController {
  constructor(private readonly service: BankStmtService) {}

  /** 上传对账单（Excel/CSV），解析落库并自动匹配 */
  @Post('import')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @RequirePermissions('bank-stmt:import')
  @Operation('导入银行对账单')
  import(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('bankAccountId') bankAccountId: string,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('请上传对账单文件')
    return this.service.import(
      { buffer: file.buffer, originalName: file.originalname },
      bankAccountId,
      this.operator(req),
    )
  }

  @Get()
  @RequirePermissions('bank-stmt')
  @Operation('查询银行流水')
  findAll(
    @Query() query: PaginationQueryDto,
    @Query('status') status?: string,
    @Query('batchId') batchId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.findAll({ ...query, status, batchId, startDate, endDate })
  }

  @Get('summary')
  @RequirePermissions('bank-stmt')
  @Operation('银行流水汇总')
  summary() {
    return this.service.summary()
  }

  /** 待确认行入账（生成资金单据+凭证） */
  @Post(':id/book')
  @RequirePermissions('bank-stmt:book')
  @Operation('流水行入账')
  book(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { bizType: string; accountId: string; summary?: string },
    @Req() req: Request,
  ) {
    return this.service.book(id, dto, this.operator(req))
  }

  @Post(':id/skip')
  @RequirePermissions('bank-stmt:book')
  @Operation('跳过流水行')
  skip(@Param('id', ParseUUIDPipe) id: string, @Body() dto: { remark?: string }) {
    return this.service.skip(id, dto?.remark)
  }

  @Post(':id/restore')
  @RequirePermissions('bank-stmt:book')
  @Operation('恢复流水行为待确认')
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.restore(id)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('bank-stmt:delete')
  @Operation('删除流水行')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.service.remove(id, this.operator(req))
  }

  @Delete('batch/:batchId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('bank-stmt:delete')
  @Operation('按批次删除流水')
  removeBatch(@Param('batchId') batchId: string, @Req() req: Request) {
    return this.service.removeBatch(batchId, this.operator(req))
  }

  private operator(req: Request): Operator {
    const user = getCurrentUser(req)
    return { id: user.sub, nickname: user.nickname }
  }
}
