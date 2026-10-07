import { Column, Entity, Index } from 'typeorm'
import { BaseEntity } from './base.entity'
import { ReceiptStatus, ReceiptType } from '../common/enums'
import { decimalTransformer } from '../common/transformers/decimal.transformer'

/**
 * 票据与识别记录（一键录入的原始落盘 + 结构化结果）
 */
@Entity('fin_receipt')
@Index('uk_receipt_sha256', ['sha256'], { unique: true })
export class Receipt extends BaseEntity {
  @Column({ name: 'file_name', length: 255, comment: '原始文件名' })
  fileName: string

  @Column({ name: 'mime_type', length: 50, comment: '原始 MIME 类型' })
  mimeType: string

  @Column({
    name: 'receipt_type',
    length: 30,
    default: 'unknown',
    comment: '票据类型：invoice/id_card/business_license/train_ticket/receipt/unknown',
  })
  receiptType: ReceiptType | string

  @Column({ name: 'receipt_type_name', length: 50, default: '未识别', comment: '票据类型中文名' })
  receiptTypeName: string

  @Column({ name: 'storage_path', length: 500, comment: '落盘相对路径（data/uploads 下）' })
  storagePath: string

  @Column({ length: 64, comment: '文件 sha256' })
  sha256: string

  @Column({ name: 'page_count', type: 'int', default: 1, comment: '页数' })
  pageCount: number

  @Column({ name: 'raw_text', type: 'text', nullable: true, comment: '原始文本（OCR 或 PDF 文本层）' })
  rawText: string | null

  @Column({ type: 'text', nullable: true, comment: '结构化抽取结果 JSON' })
  structured: string | null

  @Column({
    type: 'float',
    default: 0,
    comment: '整体置信度 0-1',
  })
  confidence: number

  @Column({ length: 20, default: 'parsed', comment: '状态：parsed/duplicate/failed' })
  status: ReceiptStatus | string

  @Column({ name: 'issue_date', type: 'date', nullable: true, comment: '开票/交易日期' })
  issueDate: string | null

  @Column({
    name: 'amount',
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
    comment: '价税合计（台账汇总用）',
  })
  amount: number | null

  @Column({
    name: 'tax_amount',
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
    comment: '税额',
  })
  taxAmount: number | null

  @Column({ name: 'invoice_code', length: 30, nullable: true, comment: '发票代码' })
  invoiceCode: string | null

  @Column({ name: 'invoice_no', length: 30, nullable: true, comment: '发票号码' })
  invoiceNo: string | null

  @Column({ name: 'seller_name', length: 200, nullable: true, comment: '销售方名称' })
  sellerName: string | null

  @Column({ name: 'buyer_name', length: 200, nullable: true, comment: '购买方名称' })
  buyerName: string | null

  @Column({ name: 'related_id', type: 'varchar', nullable: true, comment: '关联单据ID（报销单/凭证等，P16+ 使用）' })
  relatedId: string | null

  @Column({ name: 'created_by', type: 'varchar', nullable: true })
  createdBy: string | null

  @Column({ name: 'created_by_name', length: 50, nullable: true })
  createdByName: string | null

  @Column({ name: 'voucher_id', type: 'varchar', nullable: true, comment: '关联凭证ID（草稿或已入账，P17 使用）' })
  voucherId: string | null

  @Column({ name: 'reject_reason', length: 200, nullable: true, comment: '驳回原因' })
  rejectReason: string | null

  @Column({ name: 'confirmed_by', type: 'varchar', nullable: true })
  confirmedBy: string | null

  @Column({ name: 'confirmed_by_name', length: 50, nullable: true })
  confirmedByName: string | null

  @Column({ name: 'confirmed_at', type: 'datetime', nullable: true })
  confirmedAt: Date | null

  @Column({ name: 'rejected_at', type: 'datetime', nullable: true })
  rejectedAt: Date | null

  @Column({ length: 200, nullable: true })
  remark: string | null
}
