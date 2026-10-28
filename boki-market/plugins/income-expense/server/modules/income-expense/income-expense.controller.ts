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
import { IncomeExpenseService } from './income-expense.service'
import { SaveIncomeExpenseDto } from './dto/income-expense.dto'
import { PaginationQueryDto } from '@core/common/dto/pagination.dto'
import { RequirePermissions } from '@core/common/decorators/permissions.decorator'
import { Operation } from '@core/common/decorators/operation.decorator'
import { getCurrentUser } from '@core/common/utils/request.util'

@Controller('income-expense')
export class IncomeExpenseController {
  constructor(private readonly incomeExpenseService: IncomeExpenseService) {}

  @Get()
  @RequirePermissions('income-expense')
  @Operation('查询其他收支单据')
  findAll(
    @Query() query: PaginationQueryDto,
    @Query('bizType') bizType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.incomeExpenseService.findAll({ ...query, bizType, startDate, endDate })
  }

  @Get(':id')
  @RequirePermissions('income-expense')
  @Operation('查询其他收支单据详情')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.incomeExpenseService.findOne(id)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('income-expense:create')
  @Operation('新增其他收支单据')
  create(@Body() dto: SaveIncomeExpenseDto, @Req() req: Request) {
    const user = getCurrentUser(req)
    return this.incomeExpenseService.create(
      dto,
      { id: user.sub, nickname: user.nickname },
      this.autoApprove(dto),
    )
  }

  @Put(':id')
  @RequirePermissions('income-expense:update')
  @Operation('编辑其他收支单据')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveIncomeExpenseDto,
    @Req() req: Request,
  ) {
    const user = getCurrentUser(req)
    return this.incomeExpenseService.update(
      id,
      dto,
      { id: user.sub, nickname: user.nickname },
      this.autoApprove(dto),
    )
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('income-expense:delete')
  @Operation('删除其他收支单据')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.incomeExpenseService.remove(id)
  }

  private autoApprove(dto: SaveIncomeExpenseDto): boolean {
    const v = dto.autoApprove
    if (v === undefined) return true
    return !(v === false || v === 0 || v === 'false' || v === '0')
  }
}