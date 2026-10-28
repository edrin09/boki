import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import dayjs from 'dayjs'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { ExpenseClaimsService } from './expense-claims.service'
import { ExpenseClaimsImportService } from './expense-claims-import.service'
import { HrDocPdfService } from '@core/common/pdf/hr-doc-pdf.service'
import { sendZipResponse, zipEntries, type ZipEntry } from '@core/common/pdf/zip.util'
import {
  PayExpenseClaimDto,
  RejectExpenseClaimDto,
  SaveExpenseClaimDto,
} from './dto/expense-claim.dto'
import { CommitClaimsImportDto } from './dto/expense-claim-import.dto'
import { HrPdfPackageDto } from '@core/common/dto/pdf-package.dto'
import { PaginationQueryDto } from '@core/common/dto/pagination.dto'
import { RequirePermissions } from '@core/common/decorators/permissions.decorator'
import { Operation } from '@core/common/decorators/operation.decorator'
import { getCurrentUser } from '@core/common/utils/request.util'

@Controller('expense-claims')
export class ExpenseClaimsController {
  constructor(
    private readonly service: ExpenseClaimsService,
    private readonly importService: ExpenseClaimsImportService,
    private readonly pdfService: HrDocPdfService,
  ) {}

  @Get()
  @RequirePermissions('hr:expense-claim')
  @Operation('查询报销单列表')
  findAll(
    @Query() query: PaginationQueryDto,
    @Query('status') status?: string,
    @Query('employeeId') employeeId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.findAll({ ...query, status, employeeId, startDate, endDate })
  }

  @Get('next-no')
  @RequirePermissions('hr:expense-claim', 'hr:expense-claim:create')
  @Operation('获取下一个报销单号')
  nextNo(@Query('claimDate') claimDate?: string) {
    const date = claimDate || new Date().toISOString().slice(0, 10)
    return this.service.getNextClaimNo(date)
  }

  @Get(':id')
  @RequirePermissions('hr:expense-claim')
  @Operation('查询报销单详情')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id)
  }

  /** 批量生成原始凭证 PDF 压缩包（ids 优先，否则按筛选条件，最多 300 张） */
  @Post('pdf-package')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:expense-claim')
  @Operation('批量生成报销单PDF（原始凭证存根）')
  async pdfPackage(@Body() dto: HrPdfPackageDto, @Res() res: Response) {
    const docs = await this.service.findForPdfExport(dto)
    if (!docs.length) throw new NotFoundException('没有符合条件的报销单')
    const entries: ZipEntry[] = []
    for (const { claim, items } of docs) {
      const buffer = await this.pdfService.expenseClaimPdf(claim, items)
      entries.push({
        name: `${claim.claimNo}_${claim.employeeName}_${claim.claimDate}.pdf`,
        buffer,
      })
    }
    const zip = await zipEntries(entries)
    sendZipResponse(res, zip, `报销单原始凭证_${dayjs().format('YYYYMMDD_HHmmss')}.zip`)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('hr:expense-claim:create')
  @Operation('新增报销单')
  create(@Body() dto: SaveExpenseClaimDto, @Req() req: Request) {
    return this.service.create(dto, this.operator(req))
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:expense-claim:create')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      defParamCharset: 'utf8',
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  @Operation('导入报销单（预览解析）')
  importFile(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('请上传报销单文件（Excel/CSV）')
    return this.importService.parseFile(file.buffer, file.originalname)
  }

  @Post('import/commit')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('hr:expense-claim:create')
  @Operation('确认导入报销单（生成草稿）')
  importCommit(@Body() dto: CommitClaimsImportDto, @Req() req: Request) {
    return this.importService.commit(dto, this.operator(req))
  }

  @Put(':id')
  @RequirePermissions('hr:expense-claim:update')
  @Operation('编辑报销单')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveExpenseClaimDto,
    @Req() req: Request,
  ) {
    return this.service.update(id, dto, this.operator(req))
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:expense-claim:approve')
  @Operation('审核报销单')
  approve(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.service.approve(id, this.operator(req))
  }

  @Post(':id/pay')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:expense-claim:pay')
  @Operation('报销单付款')
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayExpenseClaimDto, @Req() req: Request) {
    return this.service.pay(id, dto, this.operator(req))
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:expense-claim:approve')
  @Operation('驳回报销单')
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectExpenseClaimDto) {
    return this.service.reject(id, dto.reason)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:expense-claim:delete')
  @Operation('删除报销单')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id)
  }

  private operator(req: Request) {
    const user = getCurrentUser(req)
    return { id: user.sub, nickname: user.nickname }
  }
}