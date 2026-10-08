import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common'
import dayjs from 'dayjs'
import { Receipt } from '../../entities/receipt.entity'
import { CompanyScopedRepository } from '../../common/company/company.repository'
import { InjectCompanyRepo } from '../../common/company/company-repo.decorator'
import { PARSERS } from './parsers/parser.registry'
import { DocumentParseService } from './document-parse.service'
import { ClassifyService } from './classify.service'
import { ReceiptWorkbenchService } from './workbench.service'
import { PartySyncService } from './party-sync.service'
import { SystemService } from '../system/system.service'
import { VouchersService } from '../vouchers/vouchers.service'
import { recoverFilename } from '../../common/utils/filename.util'
import type { ParseResult } from './parsers/parser.types'
import { ReceiptType } from '../../common/enums'

/** 上传根目录（相对 backend，与数据库同层） */
export function resolveUploadDir(): string {
  const raw = process.env.UPLOAD_DIR || './data/uploads'
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw)
}

export interface ProcessFileResult {
  fileName: string
  status: 'parsed' | 'duplicate' | 'failed'
  receiptId?: string
  receiptType?: string
  receiptTypeName?: string
  confidence?: number
  /** 是否能自动生成凭证：false 表示需要人工处理，原因见 blockReason */
  bookable?: boolean
  /** 归类结论（如「进项发票」「银行手续费」），供前端展示 AI 判断 */
  suggestKind?: string
  suggestKindLabel?: string
  /** 不能自动入账的原因；bookable 为 true 时为 null */
  blockReason?: string | null
  /** 凭证是否已自动生成（此时用户只需点一次「确认入账」） */
  drafted?: boolean
  /** 自动生成草稿失败/跳过时的说明 */
  draftMessage?: string | null
  /** 自动生成的凭证摘要，供上传结果直接展示 */
  draft?: {
    voucherId: string
    voucherNo: string
    voucherDate: string
    entries: Array<{ summary: string; accountCode: string; accountName: string; debit: number; credit: number }>
  } | null
  fields?: Array<{ key: string; label: string; value: string | number | null; confidence: number }>
  message?: string
}

/** 自动生成草稿策略（按记账公司配置） */
export interface AutoPostPolicy {
  /** 是否开启上传即自动生成草稿 */
  enabled: boolean
  /** 置信度阈值，低于该值留给人工 */
  threshold: number
}

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger('ReceiptsService')

  constructor(
    @InjectCompanyRepo(Receipt) private readonly receiptRepo: CompanyScopedRepository<Receipt>,
    private readonly parser: DocumentParseService,
    private readonly classify: ClassifyService,
    private readonly workbench: ReceiptWorkbenchService,
    private readonly systemService: SystemService,
    private readonly partySync: PartySyncService,
    private readonly vouchers: VouchersService,
  ) {}

  async processUpload(
    files: Express.Multer.File[],
    user: { id?: string; name?: string } | null,
  ): Promise<ProcessFileResult[]> {
    // 自动记账策略（按当前记账公司配置），关闭时退化为纯识别
    const policy = await this.resolveAutoPostPolicy()
    const results: ProcessFileResult[] = []
    for (const file of files) {
      try {
        results.push(await this.processOne(file, user, policy))
      } catch (err) {
        const fileName = recoverFilename(file.originalname) ?? file.originalname
        this.logger.error('票据处理失败 ' + fileName + ': ' + (err as Error).message)
        results.push({ fileName, status: 'failed', message: (err as Error).message })
      }
    }
    return results
  }

  /** 读取当前公司的自动生成草稿策略 */
  private async resolveAutoPostPolicy(): Promise<AutoPostPolicy> {
    try {
      const info = await this.systemService.getCompanyInfo()
      return {
        enabled: info.autoPostEnabled !== 0,
        threshold: Number.isFinite(Number(info.autoPostThreshold))
          ? Number(info.autoPostThreshold)
          : 0.8,
      }
    } catch {
      // 读不到公司信息时保守处理：只识别，不自动建草稿
      return { enabled: false, threshold: 0.8 }
    }
  }

  private async processOne(
    file: Express.Multer.File,
    user: { id?: string; name?: string } | null,
    policy: AutoPostPolicy,
  ): Promise<ProcessFileResult> {
    const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex')

    // 1. sha256 去重
    const byHash = await this.receiptRepo.findOne({ where: { sha256 } })
    if (byHash) {
      return {
        fileName: recoverFilename(file.originalname) ?? file.originalname,
        status: 'duplicate',
        receiptId: byHash.id,
        message: '文件内容与已有票据重复（sha256 一致），已跳过',
      }
    }

    // 2. 解析（PDF 优先文本层，否则渲染后 OCR；图片直接 OCR）
    const { result, rawText, pageCount, source } = await this.parser.parse(file.buffer, file.mimetype)

    // 3. 发票代码+号码组合去重
    const dupInvoice = await this.findDuplicateInvoice(result)
    if (dupInvoice) {
      return {
        fileName: recoverFilename(file.originalname) ?? file.originalname,
        status: 'duplicate',
        receiptId: dupInvoice.id,
        message: `发票（代码 ${dupInvoice.invoiceCode ?? '-'} / 号码 ${dupInvoice.invoiceNo ?? '-'}）已存在`,
      }
    }

    // 4. 落盘
    const storagePath = await this.saveUpload(file.buffer, file.originalname, file.mimetype)

    // 5. 保存识别记录
    const fields = result.fields
    const receipt = this.receiptRepo.create({
      fileName: recoverFilename(file.originalname) ?? file.originalname,
      mimeType: file.mimetype,
      receiptType: result.type,
      receiptTypeName: result.typeName,
      storagePath,
      sha256,
      pageCount,
      rawText: rawText.slice(0, 200_000),
      structured: JSON.stringify({ fields }),
      confidence: result.confidence,
      status: 'parsed',
      issueDate: stringOf(fields.find((f) => f.key === 'issue_date')?.value) ?? null,
      amount: numberOf(fields.find((f) => f.key === 'total_amount')?.value)
        ?? numberOf(fields.find((f) => f.key === 'amount')?.value)
        ?? null,
      taxAmount: numberOf(fields.find((f) => f.key === 'tax_amount')?.value) ?? null,
      invoiceCode: stringOf(fields.find((f) => f.key === 'invoice_code')?.value) ?? null,
      invoiceNo: stringOf(fields.find((f) => f.key === 'invoice_no')?.value) ?? null,
      sellerName: stringOf(fields.find((f) => f.key === 'seller_name')?.value) ?? null,
      buyerName: stringOf(fields.find((f) => f.key === 'buyer_name')?.value) ?? null,
      sellerTaxNo: stringOf(fields.find((f) => f.key === 'seller_tax_no')?.value) ?? null,
      buyerTaxNo: stringOf(fields.find((f) => f.key === 'buyer_tax_no')?.value) ?? null,
      createdBy: user?.id ?? null,
      createdByName: user?.name ?? null,
    })
    await this.receiptRepo.save(receipt)

    // 购销双方识别信息同步入库往来单位（按纳税人识别号去重），失败不阻断上传
    try {
      await this.partySync.syncBoth(fieldMap(fields))
    } catch (err) {
      this.logger.warn(`往来单位同步失败: ${(err as Error).message}`)
    }

    // 上传阶段即评估能否自动入账：让用户在结果里就看到"可用/需人工"，
    // 而不是到生成草稿时才收到 400。
    const verdict = await this.evaluateBookable(receipt)
    receipt.bookable = verdict.bookable ? 1 : 0
    receipt.blockReason = verdict.reason
    await this.receiptRepo.save(receipt)

    // 方案A：可归类 + 金额有效 + 置信度达标 → 直接生成凭证草稿，
    // 用户只需点一次「确认入账」。低置信度宁可多问一句。
    const auto = await this.autoGenerateDraft(receipt, result.confidence, policy, user)

    return {
      fileName: recoverFilename(file.originalname) ?? file.originalname,
      status: 'parsed',
      receiptId: receipt.id,
      receiptType: result.type,
      receiptTypeName: result.typeName,
      confidence: result.confidence,
      bookable: verdict.bookable,
      suggestKind: verdict.kind,
      suggestKindLabel: verdict.kindLabel,
      blockReason: verdict.reason,
      drafted: auto.drafted,
      draftMessage: auto.message,
      draft: auto.draft,
      fields: fields.map((f) => ({ key: f.key, label: f.label, value: f.value, confidence: f.confidence })),
    }
  }

  /**
   * 按策略决定是否自动生成凭证草稿。
   * 任一环节失败都不阻断上传：票据已入库，用户仍可在工作台手工生成。
   */
  private async autoGenerateDraft(
    receipt: Receipt,
    confidence: number,
    policy: AutoPostPolicy,
    user: { id?: string; name?: string } | null,
  ): Promise<{ drafted: boolean; message: string | null; draft: ProcessFileResult['draft'] }> {
    if (!policy.enabled) {
      return { drafted: false, message: '未开启自动生成草稿，请在工作台确认', draft: null }
    }
    if (!receipt.bookable) {
      return { drafted: false, message: '该单据无法自动归类，请人工处理', draft: null }
    }
    if (confidence < policy.threshold) {
      const pct = (confidence * 100).toFixed(0)
      return {
        drafted: false,
        message: `识别置信度 ${pct}% 低于阈值 ${(policy.threshold * 100).toFixed(0)}%，已保留为待确认`,
        draft: null,
      }
    }

    try {
      const detail = await this.workbench.generateDraft(receipt.id, {
        id: user?.id ?? 'system',
        nickname: user?.name ?? '系统',
      })
      const d = detail?.draft
      return {
        drafted: true,
        message: null,
        draft: d
          ? {
              voucherId: d.id,
              voucherNo: d.voucherNo,
              voucherDate: d.voucherDate,
              entries: (d.entries ?? []).map((e: any) => ({
                summary: e.summary,
                accountCode: e.accountCode,
                accountName: e.accountName,
                debit: Number(e.debit) || 0,
                credit: Number(e.credit) || 0,
              })),
            }
          : null,
      }
    } catch (err) {
      const message = `自动生成草稿失败：${(err as Error).message}`
      this.logger.warn(`票据 ${receipt.id} 自动建草稿失败: ${(err as Error).message}`)
      return { drafted: false, message, draft: null }
    }
  }

  /**
   * 评估一张已入库票据能否自动生成凭证。
   * 规则与工作台生成草稿保持一致：先要能归类，再要有有效金额。
   */
  private async evaluateBookable(receipt: Receipt): Promise<{
    bookable: boolean
    reason: string | null
    kind: string | null
    kindLabel: string | null
  }> {
    let kind: string | null = null
    let kindLabel: string | null = null
    try {
      const suggestion = await this.classify.suggest(receipt, { countHit: false })
      kind = suggestion.kind
      kindLabel = suggestion.kindLabel

      if (!suggestion.entries.length) {
        return {
          bookable: false,
          reason: suggestion.message ?? '该单据暂不支持自动归类，请人工处理',
          kind,
          kindLabel,
        }
      }

      // 只要有一条分录能取到非零金额，就认为可自动入账。
      // 各单据的金额字段不同（发票 total_amount / 工资 gross_amount /
      // 对账单 fee_amount），按归类模板实际用到的字段判断，
      // 避免出现"识别对了却判定不可记账"。
      // 红字发票金额为负数（红冲），同样可入账，因此只排除 0。
      const fields = fieldMap(this.parseFieldArray(receipt))
      const hasAmount = suggestion.entries.some((tpl) => {
        const v = numberOf(fields[tpl.amountSource])
        return v !== null && v !== 0
      })
      if (!hasAmount) {
        return { bookable: false, reason: '未识别到有效金额，请人工补录金额后再生成凭证', kind, kindLabel }
      }

      return { bookable: true, reason: null, kind, kindLabel }
    } catch (err) {
      return { bookable: false, reason: (err as Error).message, kind, kindLabel }
    }
  }

  private parseFieldArray(receipt: Receipt): Array<{
    key: string
    label: string
    value: string | number | null
    confidence: number
  }> {
    if (!receipt.structured) return []
    try {
      const parsed = JSON.parse(receipt.structured)
      return Array.isArray(parsed.fields) ? parsed.fields : []
    } catch {
      return []
    }
  }

  private async findDuplicateInvoice(result: ParseResult): Promise<Receipt | null> {
    const code = stringOf(result.fields.find((f) => f.key === 'invoice_code')?.value)
    const no = stringOf(result.fields.find((f) => f.key === 'invoice_no')?.value)
    if (!code || !no) return null
    return this.receiptRepo.findOne({ where: { invoiceCode: code, invoiceNo: no } })
  }

  private async saveUpload(buffer: Buffer, originalName: string, mimeType: string): Promise<string> {
    const month = dayjs().format('YYYYMM')
    const dir = path.join(resolveUploadDir(), month)
    fs.mkdirSync(dir, { recursive: true })
    const ext = path.extname(originalName) || extFromMime(mimeType)
    const fileName = `${randomUUID()}${ext}`
    await fs.promises.writeFile(path.join(dir, fileName), buffer)
    return `uploads/${month}/${fileName}`
  }

  async list(query: {
    receiptType?: string
    startDate?: string
    endDate?: string
    keyword?: string
    page?: number
    pageSize?: number
  }) {
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20))
    const qb = this.receiptRepo.createQueryBuilder('r').orderBy('r.createdAt', 'DESC')

    if (query.receiptType) qb.andWhere('r.receiptType = :receiptType', { receiptType: query.receiptType })
    if (query.startDate) qb.andWhere('r.issueDate >= :startDate', { startDate: query.startDate })
    if (query.endDate) qb.andWhere('r.issueDate <= :endDate', { endDate: query.endDate })
    if (query.keyword) {
      qb.andWhere('(r.fileName LIKE :kw OR r.sellerName LIKE :kw OR r.buyerName LIKE :kw OR r.rawText LIKE :kw)', {
        kw: `%${query.keyword}%`,
      })
    }

    const [rows, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount()
    return {
      items: rows.map((r) => this.toView(r)),
      total,
      page,
      pageSize,
    }
  }

  async findOne(id: string): Promise<Record<string, unknown> | null> {
    const r = await this.receiptRepo.findOne({ where: { id } })
    return r ? this.toView(r) : null
  }

  /**
   * 删除未入账票据：仅 parsed/drafted/rejected/failed 可删。
   * 已确认入账（或关联凭证已审核）的票据拒绝删除，避免账簿与票据脱节。
   * drafted 状态的关联草稿凭证（含分录）一并删除。
   */
  async remove(id: string): Promise<void> {
    const r = await this.receiptRepo.findOne({ where: { id } })
    if (!r) throw new NotFoundException('票据不存在')
    if (r.status === 'confirmed') {
      throw new BadRequestException('该票据已确认入账，不能删除；如需调整请到凭证管理反审核或红冲处理')
    }
    if (r.voucherId) {
      try {
        await this.vouchers.remove(r.voucherId) // 仅草稿可删，已审核会抛错兜底
      } catch (err) {
        throw new BadRequestException(`关联凭证无法删除：${(err as Error).message}`)
      }
    }
    await this.receiptRepo.remove(r)
    const abs = path.join(resolveUploadDir(), '..', r.storagePath)
    fs.promises.unlink(abs).catch(() => undefined)
  }

  /**
   * 修正识别结果（仅未入账票据）：票据类型、进项/销项方向。
   * 方向修正写入 directionOverride，归类时优先采用；修正后重新评估能否自动入账。
   */
  async update(
    id: string,
    dto: { receiptType?: string; direction?: 'input' | 'output' | null },
  ): Promise<Record<string, unknown>> {
    const r = await this.receiptRepo.findOne({ where: { id } })
    if (!r) throw new NotFoundException('票据不存在')
    if (r.status === 'confirmed') {
      throw new BadRequestException('该票据已确认入账，不能修正；如需调整请到凭证管理反审核后处理')
    }

    if (dto.receiptType) {
      if (!Object.values(ReceiptType).includes(dto.receiptType as ReceiptType)) {
        throw new BadRequestException(`未知票据类型: ${dto.receiptType}`)
      }
      r.receiptType = dto.receiptType
      const parser = PARSERS.find((p) => p.type === dto.receiptType)
      r.receiptTypeName = parser?.typeName ?? '未识别'
    }
    if (dto.direction !== undefined) {
      r.directionOverride = dto.direction
    }

    // 修正后重新评估能否自动入账，让票据重新参与自动记账流程
    const verdict = await this.evaluateBookable(r)
    r.bookable = verdict.bookable ? 1 : 0
    r.blockReason = verdict.reason
    await this.receiptRepo.save(r)
    return this.findOne(id) as Promise<Record<string, unknown>>
  }

  private toView(r: Receipt) {
    let fields: unknown[] = []
    let fieldsRaw: unknown = null
    if (r.structured) {
      try {
        const parsed = JSON.parse(r.structured)
        fields = parsed.fields ?? []
        fieldsRaw = parsed.fields ?? null
      } catch {
        fieldsRaw = r.structured
      }
    }
    return {
      id: r.id,
      fileName: recoverFilename(r.fileName) ?? r.fileName,
      mimeType: r.mimeType,
      receiptType: r.receiptType,
      receiptTypeName: r.receiptTypeName,
      storagePath: r.storagePath,
      sha256: r.sha256,
      pageCount: r.pageCount,
      confidence: r.confidence,
      status: r.status,
      bookable: r.bookable === null ? null : Boolean(r.bookable),
      blockReason: r.blockReason ?? null,
      issueDate: r.issueDate,
      amount: r.amount,
      taxAmount: r.taxAmount,
      invoiceCode: r.invoiceCode,
      invoiceNo: r.invoiceNo,
      sellerName: r.sellerName,
      buyerName: r.buyerName,
      sellerTaxNo: r.sellerTaxNo,
      buyerTaxNo: r.buyerTaxNo,
      voucherId: r.voucherId,
      directionOverride: r.directionOverride ?? null,
      rejectReason: r.rejectReason,
      confirmedByName: r.confirmedByName,
      confirmedAt: r.confirmedAt,
      rejectedAt: r.rejectedAt,
      createdAt: r.createdAt,
      rawText: r.rawText,
      fields,
      fieldsRaw,
      types: PARSERS.map((p) => ({ type: p.type, typeName: p.typeName })),
    }
  }
}

function stringOf(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined) return null
  return String(v)
}

function numberOf(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function fieldMap(fields: Array<{ key: string; value: string | number | null }>): Record<
  string,
  string | number | null
> {
  const map: Record<string, string | number | null> = {}
  for (const f of fields) map[f.key] = f.value
  return map
}

const MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/tiff': '.tiff',
  'application/pdf': '.pdf',
}

function extFromMime(mime: string): string {
  return MIME_EXT[mime] ?? '.bin'
}
