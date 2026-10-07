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
  Put,
  Query,
  Req,
} from '@nestjs/common'
import type { Request } from 'express'
import { CashBankService, Operator } from './cash-bank.service'
import { SaveCashFlowDto } from './dto/cash-bank.dto'
import { PaginationQueryDto } from '../../common/dto/pagination.dto'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { Operation } from '../../common/decorators/operation.decorator'
import { getCurrentUser } from '../../common/utils/request.util'

@Controller('cash-bank')
export class CashBankController {
  constructor(private readonly cashBankService: CashBankService) {}

  @Get()
  @RequirePermissions('cash-bank')
  @Operation('查询现金银行单据')
  findAll(
    @Query() query: PaginationQueryDto,
    @Query('bizType') bizType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.cashBankService.findAll({ ...query, bizType, startDate, endDate })
  }

  @Get(':id')
  @RequirePermissions('cash-bank')
  @Operation('查询现金银行单据详情')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.cashBankService.findOne(id)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('cash-bank:create')
  @Operation('新增现金银行单据')
  create(@Body() dto: SaveCashFlowDto, @Req() req: Request) {
    return this.cashBankService.create(dto, this.operator(req), this.autoApprove(dto))
  }

  @Put(':id')
  @RequirePermissions('cash-bank:update')
  @Operation('编辑现金银行单据')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveCashFlowDto,
    @Req() req: Request,
  ) {
    return this.cashBankService.update(id, dto, this.operator(req), this.autoApprove(dto))
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cash-bank:delete')
  @Operation('删除现金银行单据')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.cashBankService.remove(id, this.operator(req))
  }

  private operator(req: Request): Operator {
    const user = getCurrentUser(req)
    return { id: user.sub, nickname: user.nickname }
  }

  private autoApprove(dto: SaveCashFlowDto): boolean {
    const v = dto.autoApprove
    if (v === undefined) return true
    return !(v === false || v === 0 || v === 'false' || v === '0')
  }
}