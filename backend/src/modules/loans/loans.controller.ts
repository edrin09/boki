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
import { LoansService } from './loans.service'
import { RejectLoanDto, RepayLoanDto, SaveLoanDto } from './dto/loan.dto'
import { PaginationQueryDto } from '../../common/dto/pagination.dto'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { Operation } from '../../common/decorators/operation.decorator'
import { getCurrentUser } from '../../common/utils/request.util'

@Controller('loans')
export class LoansController {
  constructor(private readonly service: LoansService) {}

  @Get()
  @RequirePermissions('hr:loan')
  @Operation('查询借款单列表')
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
  @RequirePermissions('hr:loan', 'hr:loan:create')
  @Operation('获取下一个借款单号')
  nextNo(@Query('loanDate') loanDate?: string) {
    const date = loanDate || new Date().toISOString().slice(0, 10)
    return this.service.getNextLoanNo(date)
  }

  @Get(':id')
  @RequirePermissions('hr:loan')
  @Operation('查询借款单详情')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('hr:loan:create')
  @Operation('新增借款单')
  create(@Body() dto: SaveLoanDto, @Req() req: Request) {
    return this.service.create(dto, this.operator(req))
  }

  @Put(':id')
  @RequirePermissions('hr:loan:update')
  @Operation('编辑借款单')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveLoanDto,
    @Req() req: Request,
  ) {
    return this.service.update(id, dto, this.operator(req))
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:loan:approve')
  @Operation('审核借款单（发放借款）')
  approve(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.service.approve(id, this.operator(req))
  }

  @Post(':id/repay')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:loan:repay')
  @Operation('借款单还款')
  repay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RepayLoanDto, @Req() req: Request) {
    return this.service.repay(id, dto, this.operator(req))
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:loan:approve')
  @Operation('驳回借款单')
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectLoanDto) {
    return this.service.reject(id, dto.reason)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:loan:delete')
  @Operation('删除借款单')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id)
  }

  private operator(req: Request) {
    const user = getCurrentUser(req)
    return { id: user.sub, nickname: user.nickname }
  }
}
