import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import dayjs from 'dayjs'
import { Receipt } from '../../entities/receipt.entity'
import { PARSERS } from './parsers/parser.registry'
import { DocumentParseService } from './document-parse.service'
import type { ParseResult } from './parsers/parser.types'

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
  fields?: Array<{ key: string; label: string; value: string | number | null; confidence: number }>
  message?: string
}

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger('ReceiptsService')

  constructor(
    @InjectRepository(Receipt) private readonly receiptRepo: Repository<Receipt>,
    private readonly parser: DocumentParseService,
  ) {}

  async processUpload(
    files: Express.Multer.File[],
    user: { id?: string; name?: string } | null,
  ): Promise<ProcessFileResult[]> {
    const results: ProcessFileResult[] = []
    for (const file of files) {
      try {
        results.push(await this.processOne(file, user))
      } catch (err) {
        this.logger.error(`票据处理失败 ${file.originalname}: ${(err as Error).message}`)
        results.push({ fileName: file.originalname, status: 'failed', message: (err as Error).message })
      }
    }
    return results
  }

  private async processOne(
    file: Express.Multer.File,
    user: { id?: string; name?: string } | null,
  ): Promise<ProcessFileResult> {
    const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex')

    // 1. sha256 去重
    const byHash = await this.receiptRepo.findOne({ where: { sha256 } })
    if (byHash) {
      return {
        fileName: file.originalname,
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
        fileName: file.originalname,
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
      fileName: file.originalname,
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
      createdBy: user?.id ?? null,
      createdByName: user?.name ?? null,
    })
    await this.receiptRepo.save(receipt)

    return {
      fileName: file.originalname,
      status: 'parsed',
      receiptId: receipt.id,
      receiptType: result.type,
      receiptTypeName: result.typeName,
      confidence: result.confidence,
      fields: fields.map((f) => ({ key: f.key, label: f.label, value: f.value, confidence: f.confidence })),
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

  async remove(id: string): Promise<void> {
    const r = await this.receiptRepo.findOne({ where: { id } })
    if (!r) throw new NotFoundException('票据不存在')
    await this.receiptRepo.remove(r)
    const abs = path.join(resolveUploadDir(), '..', r.storagePath)
    fs.promises.unlink(abs).catch(() => undefined)
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
      fileName: r.fileName,
      mimeType: r.mimeType,
      receiptType: r.receiptType,
      receiptTypeName: r.receiptTypeName,
      storagePath: r.storagePath,
      sha256: r.sha256,
      pageCount: r.pageCount,
      confidence: r.confidence,
      status: r.status,
      issueDate: r.issueDate,
      amount: r.amount,
      taxAmount: r.taxAmount,
      invoiceCode: r.invoiceCode,
      invoiceNo: r.invoiceNo,
      sellerName: r.sellerName,
      buyerName: r.buyerName,
      voucherId: r.voucherId,
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
