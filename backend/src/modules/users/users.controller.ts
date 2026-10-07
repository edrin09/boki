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
import { UsersService } from './users.service'
import {
  CreateUserDto,
  ResetPasswordDto,
  UpdateUserDto,
  UpdateUserStatusDto,
} from './dto/user.dto'
import { PaginationQueryDto } from '../../common/dto/pagination.dto'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { Operation } from '../../common/decorators/operation.decorator'

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions('system:user')
  @Operation('查询用户列表')
  findAll(@Query() query: PaginationQueryDto) {
    return this.usersService.findAll(query)
  }

  @Get('options')
  @Operation('查询用户下拉选项')
  options() {
    return this.usersService.findAllOptions()
  }

  @Get(':id')
  @RequirePermissions('system:user')
  @Operation('查询用户详情')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('user:create')
  @Operation('新增用户')
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto)
  }

  @Put(':id')
  @RequirePermissions('user:update')
  @Operation('编辑用户')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto)
  }

  @Put(':id/status')
  @RequirePermissions('user:update')
  @Operation('修改用户状态')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.usersService.updateStatus(id, dto.status)
  }

  @Put(':id/roles')
  @RequirePermissions('user:assign-role')
  @Operation('分配用户角色')
  assignRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('roleIds') roleIds: string[],
  ) {
    return this.usersService.assignRoles(id, roleIds)
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('user:reset-password')
  @Operation('重置用户密码')
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.usersService.resetPassword(id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('user:delete')
  @Operation('删除用户')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.remove(id)
  }
}