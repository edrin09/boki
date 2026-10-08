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
import { PayrollService } from './payroll.service'
import { PayrollImportService } from './payroll-import.service'
import { GeneratePayrollDto, PayPayrollDto, SavePayrollDto } from './dto/payroll.dto'
import { CommitPayrollImportDto } from './dto/payroll-import.dto'
import { PaginationQueryDto } from '../../common/dto/pagination.dto'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { Operation } from '../../common/decorators/operation.decorator'
import { getCurrentUser } from '../../common/utils/request.util'

@Controller('payrolls')
export class PayrollController {
  constructor(
    private readonly service: PayrollService,
    private readonly importService: PayrollImportService,
  ) {}

  @Get()
  @RequirePermissions('hr:payroll')
  @Operation('查询工资单列表')
  findAll(
    @Query() query: PaginationQueryDto,
    @Query('status') status?: string,
    @Query('startPeriod') startPeriod?: string,
    @Query('endPeriod') endPeriod?: string,
  ) {
    return this.service.findAll({
      ...query,
      status,
      startPeriod: startPeriod ? Number(startPeriod) : undefined,
      endPeriod: endPeriod ? Number(endPeriod) : undefined,
    })
  }

  @Get(':id')
  @RequirePermissions('hr:payroll')
  @Operation('查询工资单详情')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id)
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:payroll:create')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      // 中文文件名按 UTF-8 解码，避免默认 latin1 导致乱码
      defParamCharset: 'utf8',
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  @Operation('导入工资表（预览解析）')
  importFile(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('请上传工资表文件（Excel/CSV/图片/PDF）')
    return this.importService.parseFile(file.buffer, file.mimetype, file.originalname)
  }

  @Post('import/commit')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('hr:payroll:create')
  @Operation('确认导入工资表（生成草稿）')
  importCommit(@Body() dto: CommitPayrollImportDto, @Req() req: Request) {
    return this.importService.commit(dto, this.operator(req))
  }

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('hr:payroll:create')
  @Operation('按在职员工生成工资单')
  generate(@Body() dto: GeneratePayrollDto, @Req() req: Request) {
    return this.service.generate(dto, this.operator(req))
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('hr:payroll:create')
  @Operation('保存工资单')
  create(@Body() dto: SavePayrollDto, @Req() req: Request) {
    return this.service.save(dto, this.operator(req))
  }

  @Put(':id')
  @RequirePermissions('hr:payroll:update')
  @Operation('编辑工资单')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SavePayrollDto,
    @Req() req: Request,
  ) {
    return this.service.update(id, dto, this.operator(req))
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:payroll:approve')
  @Operation('审核工资单（计提工资）')
  approve(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.service.approve(id, this.operator(req))
  }

  @Post(':id/pay')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:payroll:pay')
  @Operation('发放工资')
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayPayrollDto, @Req() req: Request) {
    return this.service.pay(id, dto, this.operator(req))
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:payroll:delete')
  @Operation('删除工资单')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id)
  }

  private operator(req: Request) {
    const user = getCurrentUser(req)
    return { id: user.sub, nickname: user.nickname }
  }
}