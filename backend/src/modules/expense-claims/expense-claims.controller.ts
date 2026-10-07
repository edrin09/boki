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
import { ExpenseClaimsService } from './expense-claims.service'
import {
  PayExpenseClaimDto,
  RejectExpenseClaimDto,
  SaveExpenseClaimDto,
} from './dto/expense-claim.dto'
import { PaginationQueryDto } from '../../common/dto/pagination.dto'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { Operation } from '../../common/decorators/operation.decorator'
import { getCurrentUser } from '../../common/utils/request.util'

@Controller('expense-claims')
export class ExpenseClaimsController {
  constructor(private readonly service: ExpenseClaimsService) {}

  @Get()
  @RequirePermissions('hr:expense-claim')
  @Operation('查询报销单列表')
  findAll(
    @Query() query: PaginationQueryDto,
    @Query('status') status?: string,
    @Query('employeeId') employeeId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.findAll({ ...query, status, employeeId, startDate, endDate })
  }

  @Get('next-no')
  @RequirePermissions('hr:expense-claim', 'hr:expense-claim:create')
  @Operation('获取下一个报销单号')
  nextNo(@Query('claimDate') claimDate?: string) {
    const date = claimDate || new Date().toISOString().slice(0, 10)
    return this.service.getNextClaimNo(date)
  }

  @Get(':id')
  @RequirePermissions('hr:expense-claim')
  @Operation('查询报销单详情')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('hr:expense-claim:create')
  @Operation('新增报销单')
  create(@Body() dto: SaveExpenseClaimDto, @Req() req: Request) {
    return this.service.create(dto, this.operator(req))
  }

  @Put(':id')
  @RequirePermissions('hr:expense-claim:update')
  @Operation('编辑报销单')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveExpenseClaimDto,
    @Req() req: Request,
  ) {
    return this.service.update(id, dto, this.operator(req))
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:expense-claim:approve')
  @Operation('审核报销单')
  approve(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.service.approve(id, this.operator(req))
  }

  @Post(':id/pay')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:expense-claim:pay')
  @Operation('报销单付款')
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayExpenseClaimDto, @Req() req: Request) {
    return this.service.pay(id, dto, this.operator(req))
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:expense-claim:approve')
  @Operation('驳回报销单')
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectExpenseClaimDto) {
    return this.service.reject(id, dto.reason)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:expense-claim:delete')
  @Operation('删除报销单')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id)
  }

  private operator(req: Request) {
    const user = getCurrentUser(req)
    return { id: user.sub, nickname: user.nickname }
  }
}