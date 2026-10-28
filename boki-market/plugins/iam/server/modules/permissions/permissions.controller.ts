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
} from '@nestjs/common'
import { PermissionsService } from './permissions.service'
import { RequirePermissions } from '@core/common/decorators/permissions.decorator'
import { Operation } from '@core/common/decorators/operation.decorator'

@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @RequirePermissions('system:permission')
  @Operation('查询权限列表')
  findAll() {
    return this.permissionsService.findAll()
  }

  @Get('tree')
  @RequirePermissions('system:role', 'system:permission')
  @Operation('查询权限树')
  tree() {
    return this.permissionsService.findTree()
  }

  @Get('menus')
  @Operation('查询菜单权限树')
  menus() {
    return this.permissionsService.findMenuTree()
  }

  @Get(':id')
  @RequirePermissions('system:permission')
  @Operation('查询权限详情')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.permissionsService.findOne(id)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('permission:create')
  @Operation('新增权限')
  create(@Body() dto: any) {
    return this.permissionsService.create(dto)
  }

  @Put(':id')
  @RequirePermissions('permission:update')
  @Operation('编辑权限')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return this.permissionsService.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('permission:delete')
  @Operation('删除权限')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.permissionsService.remove(id)
  }
}