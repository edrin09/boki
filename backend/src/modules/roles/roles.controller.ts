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
import { RolesService } from './roles.service'
import { AssignPermissionsDto, CreateRoleDto, UpdateRoleDto } from './dto/role.dto'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { Operation } from '../../common/decorators/operation.decorator'

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions('system:role')
  @Operation('查询角色列表')
  findAll() {
    return this.rolesService.findAll()
  }

  @Get('options')
  @Operation('查询角色下拉选项')
  options() {
    return this.rolesService.findOptions()
  }

  @Get(':id')
  @RequirePermissions('system:role')
  @Operation('查询角色详情')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.findOne(id)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('role:create')
  @Operation('新增角色')
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto)
  }

  @Put(':id')
  @RequirePermissions('role:update')
  @Operation('编辑角色')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(id, dto)
  }

  @Put(':id/permissions')
  @RequirePermissions('role:assign-permission')
  @Operation('分配角色权限')
  assignPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignPermissionsDto,
  ) {
    return this.rolesService.assignPermissions(id, dto.permissionIds)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('role:delete')
  @Operation('删除角色')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.remove(id)
  }
}