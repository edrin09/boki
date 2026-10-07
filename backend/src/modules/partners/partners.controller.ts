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
import { PartnersService } from './partners.service'
import { CreatePartnerDto, UpdatePartnerDto, BatchCreatePartnerDto } from './dto/partner.dto'
import { PaginationQueryDto } from '../../common/dto/pagination.dto'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { Operation } from '../../common/decorators/operation.decorator'

@Controller('partners')
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  @Get()
  @RequirePermissions('settings:partner')
  @Operation('查询往来单位列表')
  findAll(@Query() query: PaginationQueryDto, @Query('type') type?: string) {
    return this.partnersService.findAll({ ...query, type })
  }

  @Get('options')
  @Operation('查询往来单位下拉选项')
  options(@Query('type') type?: string) {
    return this.partnersService.findOptions(type)
  }

  @Get(':id')
  @RequirePermissions('settings:partner')
  @Operation('查询往来单位详情')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.partnersService.findOne(id)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('partner:create')
  @Operation('新增往来单位')
  create(@Body() dto: CreatePartnerDto) {
    return this.partnersService.create(dto)
  }

  @Post('batch')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('partner:create')
  @Operation('批量新增往来单位')
  createBatch(@Body() dto: BatchCreatePartnerDto) {
    return this.partnersService.createBatch(dto.items)
  }

  @Put(':id')
  @RequirePermissions('partner:update')
  @Operation('编辑往来单位')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePartnerDto) {
    return this.partnersService.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('partner:delete')
  @Operation('删除往来单位')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.partnersService.remove(id)
  }
}