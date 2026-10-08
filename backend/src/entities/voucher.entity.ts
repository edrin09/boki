import { Column, Entity, Index } from 'typeorm'
import { BaseEntity } from './base.entity'
import { VoucherSource, VoucherStatus, VoucherWord } from '../common/enums'
import { decimalTransformer } from '../common/transformers/decimal.transformer'

/**
 * 记账凭证
 */
@Entity('fin_voucher')
@Index('uk_voucher_period_no', ['companyId', 'period', 'word', 'voucherNo'], { unique: true })
export class Voucher extends BaseEntity {
  @Index('idx_voucher_company')
  @Column({ name: 'company_id', type: 'varchar', length: 36, default: '' })
  companyId: string

  @Column({ name: 'voucher_no', type: 'int', comment: '凭证号（按期间连续，从 1 开始）' })
  voucherNo: number

  @Column({ length: 10, default: '记', comment: '凭证字' })
  word: VoucherWord | string

  @Column({ type: 'int', comment: '会计期间 YYYYMM' })
  period: number

  @Column({ name: 'voucher_date', type: 'date', comment: '凭证日期' })
  voucherDate: string

  @Column({ name: 'entry_count', type: 'int', default: 0, comment: '分录条数' })
  entryCount: number

  @Column({
    name: 'debit_total',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
    comment: '借方合计',
  })
  debitTotal: number

  @Column({
    name: 'credit_total',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
    comment: '贷方合计',
  })
  creditTotal: number

  @Column({ length: 10, default: 'draft', comment: '状态：draft/approved/cancelled' })
  status: VoucherStatus | string

  @Column({ type: 'int', default: 0, comment: '附单据数' })
  attachments: number

  @Column({ length: 200, nullable: true, comment: '凭证说明' })
  remark: string | null

  /** 是否红字冲销凭证 */
  @Column({ name: 'is_reversal', type: 'boolean', default: false, comment: '是否红冲凭证' })
  isReversal: boolean

  /** 被红冲的原凭证ID */
  @Column({ name: 'reversal_of_id', type: 'varchar', nullable: true, comment: '原凭证ID' })
  reversalOfId: string | null

  /** 红冲本凭证的反凭证ID */
  @Column({ name: 'reversed_by_id', type: 'varchar', nullable: true, comment: '红冲凭证ID' })
  reversedById: string | null

  @Column({ length: 20, default: 'manual', comment: '来源：manual/cash_bank/ar_ap/income_expense' })
  sourceType: VoucherSource | string

  @Column({ name: 'source_id', type: 'varchar', nullable: true, comment: '来源单据ID' })
  sourceId: string | null

  @Column({ name: 'created_by', type: 'varchar', nullable: true, comment: '制单人ID' })
  createdBy: string | null

  @Column({ name: 'created_by_name', length: 50, nullable: true, comment: '制单人姓名' })
  createdByName: string | null

  @Column({ name: 'approved_by', type: 'varchar', nullable: true })
  approvedBy: string | null

  @Column({ name: 'approved_by_name', length: 50, nullable: true })
  approvedByName: string | null

  @Column({ name: 'approved_at', type: 'datetime', nullable: true })
  approvedAt: Date | null
}