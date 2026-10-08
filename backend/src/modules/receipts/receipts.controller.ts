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
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common'
import type { Response } from 'express'
import { FilesInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { createReadStream, existsSync } from 'node:fs'
import * as path from 'node:path'
import { ReceiptsService, resolveUploadDir } from './receipts.service'
import { ReceiptWorkbenchService, Operator } from './workbench.service'
import { ClassifyRulesService } from './classify-rules.service'
import { Operation } from '../../common/decorators/operation.decorator'
import { SkipWrap } from '../../common/decorators/skip-wrap.decorator'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { ReceiptType } from '../../common/enums'
import {
  ConfirmBatchDto,
  RejectReceiptDto,
  SaveClassifyRuleDto,
  ToggleRuleDto,
  UpdateDraftDto,
} from './dto/workbench.dto'

const ALLOWED_MIME = /^(image\/(jpeg|png|webp|bmp|tiff)|application\/pdf)$/
const MAX_FILE_BYTES = 20 * 1024 * 1024
const MAX_FILES = 20

@Controller('receipts')
export class ReceiptsController {
  constructor(
    private readonly service: ReceiptsService,
    private readonly workbench: ReceiptWorkbenchService,
    private readonly rules: ClassifyRulesService,
  ) {}

  private operator(req: Request & { user?: { id?: string; nickname?: string } }): Operator {
    return { id: req.user?.id ?? 'system', nickname: req.user?.nickname ?? '系统' }
  }

  // ==================== 上传与列表（P15） ====================

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES, {
      storage: memoryStorage(),
      // 中文文件名按 UTF-8 解码，避免默认 latin1 导致乱码
      defParamCharset: 'utf8',
      limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
    }),
  )
  @Operation('上传并识别票据')
  upload(
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: Request & { user?: { id?: string; name?: string } },
  ) {
    if (!files || files.length === 0) throw new BadRequestException('请选择要上传的图片或 PDF 文件')
    for (const file of files) {
      if (!ALLOWED_MIME.test(file.mimetype)) {
        throw new BadRequestException(`不支持的文件类型: ${file.originalname}（${file.mimetype}）`)
      }
    }
    return this.service.processUpload(files, req.user ?? null)
  }

  @Get()
  @RequirePermissions('receipt:list')
  @Operation('查询票据列表')
  list(
    @Query('receiptType') receiptType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('keyword') keyword?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    if (receiptType && !Object.values(ReceiptType).includes(receiptType as ReceiptType)) {
      throw new BadRequestException(`未知票据类型: ${receiptType}`)
    }
    return this.service.list({ receiptType, startDate, endDate, keyword, page, pageSize })
  }

  // ==================== 待确认工作台（P17.4） ====================

  @Get('pending')
  @RequirePermissions('receipt:list')
  @Operation('查询待确认票据')
  pending(@Query('page') page?: number, @Query('pageSize') pageSize?: number) {
    return this.workbench.pendingList({ page, pageSize })
  }

  @Post('confirm-batch')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('receipt:confirm')
  @Operation('批量确认入账')
  confirmBatch(@Body() dto: ConfirmBatchDto, @Req() req: Request & { user?: { id?: string; nickname?: string } }) {
    return this.workbench.confirmBatch(dto.ids, this.operator(req))
  }

  // ==================== 归类规则（P17.5） ====================

  @Get('rules')
  @RequirePermissions('receipt:rule')
  @Operation('查询归类规则')
  listRules(
    @Query('keyword') keyword?: string,
    @Query('matchType') matchType?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.rules.findAll({ keyword, matchType, page, pageSize })
  }

  @Post('rules')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('receipt:rule')
  @Operation('新增归类规则')
  createRule(@Body() dto: SaveClassifyRuleDto) {
    return this.rules.create(dto)
  }

  @Get('rules/:id')
  @RequirePermissions('receipt:rule')
  @Operation('查询归类规则')
  getRule(@Param('id') id: string) {
    return this.rules.findOne(id)
  }

  @Put('rules/:id')
  @RequirePermissions('receipt:rule')
  @Operation('编辑归类规则')
  updateRule(@Param('id') id: string, @Body() dto: SaveClassifyRuleDto) {
    return this.rules.update(id, dto)
  }

  @Delete('rules/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('receipt:rule')
  @Operation('删除归类规则')
  removeRule(@Param('id') id: string) {
    return this.rules.remove(id)
  }

  @Put('rules/:id/toggle')
  @RequirePermissions('receipt:rule')
  @Operation('启用/停用归类规则')
  toggleRule(@Param('id') id: string, @Body() dto: ToggleRuleDto) {
    return this.rules.toggle(id, dto)
  }

  // ==================== 票据详情与文件（P15/P17） ====================

  @Get(':id/file')
  @SkipWrap()
  @RequirePermissions('receipt:list')
  @Operation('查看票据原图')
  file(@Param('id') id: string, @Res() res: Response) {
    void this.getReceiptFile(id, res)
  }

  @Get(':id')
  @RequirePermissions('receipt:list')
  @Operation('查询票据详情')
  async detail(@Param('id') id: string) {
    const receipt = await this.service.findOne(id)
    if (!receipt) throw new NotFoundException('票据不存在')
    return receipt
  }

  // ==================== 草稿与确认（P17.3/P17.4） ====================

  @Post(':id/draft')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('receipt:confirm')
  @Operation('生成凭证草稿')
  generateDraft(@Param('id') id: string, @Req() req: Request & { user?: { id?: string; nickname?: string } }) {
    return this.workbench.generateDraft(id, this.operator(req))
  }

  @Put(':id/draft')
  @RequirePermissions('receipt:confirm')
  @Operation('修改凭证草稿')
  updateDraft(
    @Param('id') id: string,
    @Body() dto: UpdateDraftDto,
    @Req() req: Request & { user?: { id?: string; nickname?: string } },
  ) {
    return this.workbench.updateDraft(id, dto, this.operator(req))
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('receipt:confirm')
  @Operation('确认入账')
  confirm(@Param('id') id: string, @Req() req: Request & { user?: { id?: string; nickname?: string } }) {
    return this.workbench.confirm(id, this.operator(req))
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('receipt:confirm')
  @Operation('驳回票据')
  reject(@Param('id') id: string, @Body() dto: RejectReceiptDto) {
    return this.workbench.reject(id, dto)
  }

  @Delete(':id')
  @RequirePermissions('receipt:delete')
  @Operation('删除票据')
  async remove(@Param('id') id: string) {
    await this.service.remove(id)
    return { success: true }
  }

  // ==================== 内部 ====================

  private async getReceiptFile(id: string, res: Response): Promise<void> {
    const receipt = await this.service.findOne(id)
    if (!receipt) throw new NotFoundException('票据不存在')
    const abs = path.join(resolveUploadDir(), '..', String(receipt.storagePath ?? ''))
    if (!existsSync(abs)) throw new NotFoundException('文件不存在')
    res.setHeader('Content-Type', String(receipt.mimeType ?? 'application/octet-stream'))
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(String(receipt.fileName ?? 'file'))}"`)
    createReadStream(abs).pipe(res)
  }
}
