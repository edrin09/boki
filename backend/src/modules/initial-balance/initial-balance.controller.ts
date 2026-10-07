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
} from '@nestjs/common'
import { InitialBalanceService } from './initial-balance.service'
import {
  BatchSaveInitialBalanceDto,
  SaveInitialBalanceDto,
} from './dto/initial-balance.dto'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { Operation } from '../../common/decorators/operation.decorator'

@Controller('initial-balances')
export class InitialBalanceController {
  constructor(private readonly initialBalanceService: InitialBalanceService) {}

  @Get()
  @RequirePermissions('settings:initial-balance')
  @Operation('查询期初余额')
  findByYear(
    @Query('fiscalYear', ParseIntPipe) fiscalYear: number,
    @Query('accountId') accountId?: string,
  ) {
    return this.initialBalanceService.findByYear(fiscalYear, accountId)
  }

  @Get('check')
  @RequirePermissions('settings:initial-balance')
  @Operation('期初余额试算平衡校验')
  check(@Query('fiscalYear', ParseIntPipe) fiscalYear: number) {
    return this.initialBalanceService.checkBalance(fiscalYear)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('initial-balance:create')
  @Operation('录入期初余额')
  save(@Body() dto: SaveInitialBalanceDto) {
    return this.initialBalanceService.save(dto)
  }

  @Post('batch')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('initial-balance:create')
  @Operation('批量录入期初余额')
  batchSave(@Body() dto: BatchSaveInitialBalanceDto) {
    return this.initialBalanceService.batchSave(dto)
  }

  @Put(':id')
  @RequirePermissions('initial-balance:update')
  @Operation('修改期初余额')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveInitialBalanceDto) {
    void id
    return this.initialBalanceService.save(dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('initial-balance:delete')
  @Operation('删除期初余额')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.initialBalanceService.remove(id)
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('initial-balance:delete')
  @Operation('清空指定年度期初余额')
  clearYear(@Query('fiscalYear', ParseIntPipe) fiscalYear: number) {
    return this.initialBalanceService.clearYear(fiscalYear)
  }
}