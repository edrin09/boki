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
import { EmployeesService } from './employees.service'
import { CreateEmployeeDto, UpdateEmployeeDto, BatchCreateEmployeeDto } from './dto/employee.dto'
import { PaginationQueryDto } from '../../common/dto/pagination.dto'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { Operation } from '../../common/decorators/operation.decorator'

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @RequirePermissions('hr:employee')
  @Operation('查询员工列表')
  findAll(
    @Query() query: PaginationQueryDto,
    @Query('status') status?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.employeesService.findAll({
      ...query,
      status: status !== undefined && status !== '' ? Number(status) : undefined,
      departmentId,
    })
  }

  @Get('options')
  @Operation('查询员工下拉选项')
  options(@Query('onlyOnJob') onlyOnJob?: string) {
    return this.employeesService.findOptions(onlyOnJob !== 'false')
  }

  @Get(':id')
  @RequirePermissions('hr:employee')
  @Operation('查询员工详情')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.employeesService.findOne(id)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('hr:employee:create')
  @Operation('新增员工')
  create(@Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(dto)
  }

  @Post('batch')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:employee:create')
  @Operation('批量新增员工')
  createBatch(@Body() dto: BatchCreateEmployeeDto) {
    return this.employeesService.createBatch(dto.items)
  }

  @Put(':id')
  @RequirePermissions('hr:employee:update')
  @Operation('编辑员工')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employeesService.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:employee:delete')
  @Operation('删除员工')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.employeesService.remove(id)
  }
}