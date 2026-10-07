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
import { AccountsService } from './accounts.service'
import {
  CreateAccountDto,
  UpdateAccountDto,
  UpdateAccountStatusDto,
} from './dto/account.dto'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { Operation } from '../../common/decorators/operation.decorator'

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  @RequirePermissions('settings:account')
  @Operation('查询会计科目列表')
  findAll(
    @Query('keyword') keyword?: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
  ) {
    return this.accountsService.findAll({
      keyword,
      category,
      status: status !== undefined && status !== '' ? Number(status) : undefined,
    })
  }

  @Get('tree')
  @RequirePermissions('settings:account')
  @Operation('查询会计科目树')
  tree(@Query('keyword') keyword?: string, @Query('status') status?: string) {
    return this.accountsService.findTree({
      keyword,
      status: status !== undefined && status !== '' ? Number(status) : undefined,
    })
  }

  @Get('options')
  @Operation('查询明细科目下拉选项')
  options() {
    return this.accountsService.findLeafOptions()
  }

  @Get(':id')
  @RequirePermissions('settings:account')
  @Operation('查询会计科目详情')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.accountsService.findOne(id)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('account:create')
  @Operation('新增会计科目')
  create(@Body() dto: CreateAccountDto) {
    return this.accountsService.create(dto)
  }

  @Put(':id')
  @RequirePermissions('account:update')
  @Operation('编辑会计科目')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAccountDto) {
    return this.accountsService.update(id, dto)
  }

  @Put(':id/status')
  @RequirePermissions('account:update')
  @Operation('启用/禁用会计科目')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountStatusDto,
  ) {
    return this.accountsService.updateStatus(id, dto.status)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('account:delete')
  @Operation('删除会计科目')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.accountsService.remove(id)
  }
}