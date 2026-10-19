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
import { LoansService } from './loans.service'
import { LoansImportService } from './loans-import.service'
import { EmployeeSettlementService } from './employee-settlement.service'
import { HrDocPdfService } from '../../common/pdf/hr-doc-pdf.service'
import { sendZipResponse, zipEntries, type ZipEntry } from '../../common/pdf/zip.util'
import { RejectLoanDto, RepayLoanDto, SaveLoanDto } from './dto/loan.dto'
import { CommitLoansImportDto } from './dto/loan-import.dto'
import { HrPdfPackageDto } from '../../common/dto/pdf-package.dto'
import { PaginationQueryDto } from '../../common/dto/pagination.dto'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { Operation } from '../../common/decorators/operation.decorator'
import { getCurrentUser } from '../../common/utils/request.util'

@Controller('loans')
export class LoansController {
  constructor(
    private readonly service: LoansService,
    private readonly importService: LoansImportService,
    private readonly settlementService: EmployeeSettlementService,
    private readonly pdfService: HrDocPdfService,
  ) {}

  @Get()
  @RequirePermissions('hr:loan')
  @Operation('查询借款单列表')
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
  @RequirePermissions('hr:loan', 'hr:loan:create')
  @Operation('获取下一个借款单号')
  nextNo(@Query('loanDate') loanDate?: string) {
    const date = loanDate || new Date().toISOString().slice(0, 10)
    return this.service.getNextLoanNo(date)
  }

  /** 某员工尚未还清的借款单（报销/采购发票抵充时选择） */
  @Get('outstanding')
  @RequirePermissions('hr:loan')
  @Operation('查询员工未还清借款')
  outstanding(@Query('employeeId') employeeId?: string) {
    return this.service.outstandingLoans(employeeId ?? '')
  }

  /** 员工往来余额（按员工汇总借款/已还/抵充/余额） */
  @Get('employee-balances')
  @RequirePermissions('hr:loan')
  @Operation('查询员工往来余额')
  employeeBalances(
    @Query() query: PaginationQueryDto,
    @Query('keyword') keyword?: string,
  ) {
    return this.settlementService.employeeBalances({ ...query, keyword })
  }

  /** 借款核销流水（还款/报销抵充/发票抵充/工资扣回） */
  @Get('settlements')
  @RequirePermissions('hr:loan')
  @Operation('查询借款核销流水')
  settlements(
    @Query() query: PaginationQueryDto,
    @Query('employeeId') employeeId?: string,
    @Query('loanId') loanId?: string,
  ) {
    return this.settlementService.settlements({ ...query, employeeId, loanId })
  }

  @Get(':id')
  @RequirePermissions('hr:loan')
  @Operation('查询借款单详情')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id)
  }

  /** 批量生成原始凭证 PDF 压缩包（ids 优先，否则按筛选条件，最多 300 张） */
  @Post('pdf-package')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:loan')
  @Operation('批量生成借款单PDF（原始凭证存根）')
  async pdfPackage(@Body() dto: HrPdfPackageDto, @Res() res: Response) {
    const loans = await this.service.findForPdfExport(dto)
    if (!loans.length) throw new NotFoundException('没有符合条件的借款单')
    const entries: ZipEntry[] = []
    for (const loan of loans) {
      const buffer = await this.pdfService.loanPdf(loan)
      entries.push({
        name: `${loan.loanNo}_${loan.employeeName}_${loan.loanDate}.pdf`,
        buffer,
      })
    }
    const zip = await zipEntries(entries)
    sendZipResponse(res, zip, `借款单原始凭证_${dayjs().format('YYYYMMDD_HHmmss')}.zip`)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('hr:loan:create')
  @Operation('新增借款单')
  create(@Body() dto: SaveLoanDto, @Req() req: Request) {
    return this.service.create(dto, this.operator(req))
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:loan:create')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      defParamCharset: 'utf8',
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  @Operation('导入借款单（预览解析）')
  importFile(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('请上传借款单文件（Excel/CSV）')
    return this.importService.parseFile(file.buffer, file.originalname)
  }

  @Post('import/commit')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('hr:loan:create')
  @Operation('确认导入借款单（生成草稿）')
  importCommit(@Body() dto: CommitLoansImportDto, @Req() req: Request) {
    return this.importService.commit(dto, this.operator(req))
  }

  @Put(':id')
  @RequirePermissions('hr:loan:update')
  @Operation('编辑借款单')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveLoanDto,
    @Req() req: Request,
  ) {
    return this.service.update(id, dto, this.operator(req))
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:loan:approve')
  @Operation('审核借款单（发放借款）')
  approve(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.service.approve(id, this.operator(req))
  }

  @Post(':id/repay')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:loan:repay')
  @Operation('借款单还款')
  repay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RepayLoanDto, @Req() req: Request) {
    return this.service.repay(id, dto, this.operator(req))
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:loan:approve')
  @Operation('驳回借款单')
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectLoanDto) {
    return this.service.reject(id, dto.reason)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:loan:delete')
  @Operation('删除借款单')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id)
  }

  private operator(req: Request) {
    const user = getCurrentUser(req)
    return { id: user.sub, nickname: user.nickname }
  }
}
