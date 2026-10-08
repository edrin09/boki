import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common'
import type { Response } from 'express'
import { SystemService } from './system.service'
import { CleanLogsDto, RestoreBackupDto } from './dto/system.dto'
import { PaginationQueryDto } from '../../common/dto/pagination.dto'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { RequireRoles } from '../../common/decorators/roles.decorator'
import { Operation } from '../../common/decorators/operation.decorator'
import { SkipWrap } from '../../common/decorators/skip-wrap.decorator'

@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  // ==================== 工作台 / 信息 ====================

  @Get('company')
  @Operation('查询公司信息')
  companyInfo() {
    return this.systemService.getCompanyInfo()
  }

  @Put('company')
  @RequirePermissions('settings:company')
  @Operation('保存公司信息')
  saveCompanyInfo(@Body() dto: {
    companyName?: string
    taxNo?: string
    taxpayerType?: string
    vatRate?: number
    taxDeclareCycle?: string
    autoPostEnabled?: number
    autoPostThreshold?: number
  }) {
    return this.systemService.saveCompanyInfo(dto)
  }

  @Get('dashboard')
  @Operation('查询工作台统计')
  dashboard() {
    return this.systemService.getDashboard()
  }

  @Get('info')
  @RequirePermissions('system:backup')
  @Operation('查询系统信息')
  info() {
    return this.systemService.getSystemInfo()
  }

  // ==================== 操作日志 ====================

  @Get('logs')
  @RequirePermissions('system:log')
  @Operation('查询操作日志')
  findLogs(
    @Query() query: PaginationQueryDto,
    @Query('module') module?: string,
    @Query('username') username?: string,
    @Query('success') success?: string,
  ) {
    return this.systemService.findLogs({ ...query, module, username, success })
  }

  @Post('logs/clean')
  @HttpCode(HttpStatus.OK)
  @RequireRoles('admin')
  @Operation('清理历史日志')
  cleanLogs(@Body() dto: CleanLogsDto) {
    return this.systemService.cleanLogs(dto.keepDays ?? 30)
  }

  // ==================== 备份与恢复 ====================

  @Get('backups')
  @RequirePermissions('system:backup')
  @Operation('查询备份列表')
  listBackups() {
    return this.systemService.listBackups()
  }

  @Post('backups')
  @HttpCode(HttpStatus.CREATED)
  @RequireRoles('admin')
  @Operation('创建数据库备份')
  createBackup() {
    return this.systemService.createBackup()
  }

  @Get('backups/download')
  @SkipWrap()
  @RequirePermissions('system:backup:download')
  @Operation('下载数据库备份')
  downloadBackup(@Query('filename') filename: string, @Res() res: Response) {
    const { stream, filename: name } = this.systemService.openBackupStream(filename)
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`)
    stream.pipe(res)
  }

  @Post('backups/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('system:backup:restore')
  @Operation('从备份恢复数据库')
  restore(@Body() dto: RestoreBackupDto) {
    return this.systemService.restoreBackup(dto.filename)
  }

  @Delete('backups/:filename')
  @HttpCode(HttpStatus.OK)
  @RequireRoles('admin')
  @Operation('删除备份文件')
  removeBackup(@Param('filename') filename: string) {
    return this.systemService.removeBackup(filename)
  }
}