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
import { DepartmentsService } from './departments.service'
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto/department.dto'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { Operation } from '../../common/decorators/operation.decorator'

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  @RequirePermissions('settings:department')
  @Operation('查询部门列表')
  findAll(@Query('keyword') keyword?: string) {
    return this.departmentsService.findAll(keyword)
  }

  @Get('tree')
  @RequirePermissions('settings:department')
  @Operation('查询部门树')
  tree(@Query('keyword') keyword?: string) {
    return this.departmentsService.findTree(keyword)
  }

  @Get('options')
  @Operation('查询部门下拉选项')
  options() {
    return this.departmentsService.findOptions()
  }

  @Get(':id')
  @RequirePermissions('settings:department')
  @Operation('查询部门详情')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.departmentsService.findOne(id)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('department:create')
  @Operation('新增部门')
  create(@Body() dto: CreateDepartmentDto) {
    return this.departmentsService.create(dto)
  }

  @Put(':id')
  @RequirePermissions('department:update')
  @Operation('编辑部门')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDepartmentDto) {
    return this.departmentsService.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('department:delete')
  @Operation('删除部门')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.departmentsService.remove(id)
  }
}