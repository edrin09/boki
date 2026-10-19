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
import { FixedExpenseService } from './fixed-expense.service'
import { SaveFixedExpenseDto } from './dto/fixed-expense.dto'
import { PaginationQueryDto } from '../../common/dto/pagination.dto'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { Operation } from '../../common/decorators/operation.decorator'
import { getCurrentUser } from '../../common/utils/request.util'

@Controller('fixed-expenses')
export class FixedExpenseController {
  constructor(private readonly service: FixedExpenseService) {}

  @Get()
  @RequirePermissions('fixed-expense')
  @Operation('查询固定费用列表')
  findAll(
    @Query() query: PaginationQueryDto,
    @Query('status') status?: string,
  ) {
    return this.service.findAll({ ...query, status: status as unknown as number })
  }

  @Get('pending')
  @RequirePermissions('fixed-expense')
  @Operation('查询待生成固定费用')
  pending(@Query('untilPeriod') untilPeriod?: string) {
    return this.service.pending(untilPeriod)
  }

  @Get('suggest')
  @RequirePermissions('fixed-expense')
  @Operation('按名称智能推荐费用科目')
  suggest(@Query('name') name?: string) {
    return this.service.suggest(name ?? '')
  }

  @Get(':id/logs')
  @RequirePermissions('fixed-expense')
  @Operation('查询固定费用生成历史')
  logs(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.logs(id)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('fixed-expense:create')
  @Operation('新增固定费用')
  create(@Body() dto: SaveFixedExpenseDto, @Req() req: Request) {
    const user = getCurrentUser(req)
    return this.service.create(dto, { id: user.sub, nickname: user.nickname })
  }

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('fixed-expense:create')
  @Operation('批量生成到期固定费用单据')
  generate(@Req() req: Request, @Body() body?: { untilPeriod?: string }) {
    const user = getCurrentUser(req)
    return this.service.generate({ id: user.sub, nickname: user.nickname }, body?.untilPeriod)
  }

  @Put(':id')
  @RequirePermissions('fixed-expense:update')
  @Operation('编辑固定费用')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveFixedExpenseDto,
  ) {
    return this.service.update(id, dto)
  }

  @Put(':id/status')
  @RequirePermissions('fixed-expense:update')
  @Operation('启用/停用固定费用')
  toggleStatus(@Param('id', ParseUUIDPipe) id: string, @Body() body: { status: number }) {
    return this.service.toggleStatus(id, body?.status)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('fixed-expense:delete')
  @Operation('删除固定费用')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id)
  }
}
