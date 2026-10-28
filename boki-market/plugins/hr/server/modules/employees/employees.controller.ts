import {
  BadRequestException,
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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import type { Request } from 'express'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { EmployeesService } from './employees.service'
import { EmployeesImportService } from './employees-import.service'
import { CreateEmployeeDto, UpdateEmployeeDto, BatchCreateEmployeeDto } from './dto/employee.dto'
import { CommitEmployeesImportDto } from './dto/employee-import.dto'
import { PaginationQueryDto } from '@core/common/dto/pagination.dto'
import { RequirePermissions } from '@core/common/decorators/permissions.decorator'
import { Operation } from '@core/common/decorators/operation.decorator'

@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly importService: EmployeesImportService,
  ) {}

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

  @Get(':id/loans')
  @RequirePermissions('hr:employee')
  @Operation('查询员工欠款明细（借款单/核销流水/汇总）')
  findDebts(@Param('id', ParseUUIDPipe) id: string) {
    return this.employeesService.findDebts(id)
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

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:employee:create')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      defParamCharset: 'utf8',
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  @Operation('导入员工花名册（预览解析）')
  importFile(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('请上传花名册文件（Excel/CSV）')
    return this.importService.parseFile(file.buffer, file.originalname)
  }

  @Post('import/commit')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('hr:employee:create')
  @Operation('确认导入花名册（批量建档）')
  importCommit(@Body() dto: CommitEmployeesImportDto) {
    return this.importService.commit(dto)
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