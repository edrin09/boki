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
} from '@nestjs/common'
import { BanksService } from './banks.service'
import { CreateBankDto, UpdateBankDto } from './dto/bank.dto'
import { PaginationQueryDto } from '@core/common/dto/pagination.dto'
import { RequirePermissions } from '@core/common/decorators/permissions.decorator'
import { Operation } from '@core/common/decorators/operation.decorator'

@Controller('banks')
export class BanksController {
  constructor(private readonly banksService: BanksService) {}

  @Get()
  @RequirePermissions('settings:bank')
  @Operation('查询资金账户列表')
  findAll(@Query() query: PaginationQueryDto, @Query('type') type?: string) {
    return this.banksService.findAll({ ...query, type })
  }

  @Get('options')
  @Operation('查询资金账户下拉选项')
  options(@Query('type') type?: string) {
    return this.banksService.findOptions(type)
  }

  @Get(':id')
  @RequirePermissions('settings:bank')
  @Operation('查询资金账户详情')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.banksService.findOne(id)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('bank:create')
  @Operation('新增资金账户')
  create(@Body() dto: CreateBankDto) {
    return this.banksService.create(dto)
  }

  @Put(':id')
  @RequirePermissions('bank:update')
  @Operation('编辑资金账户')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBankDto) {
    return this.banksService.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('bank:delete')
  @Operation('删除资金账户')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.banksService.remove(id)
  }
}