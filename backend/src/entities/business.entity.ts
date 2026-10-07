import { Column, Entity, Index } from 'typeorm'
import { BaseEntity } from './base.entity'
import { CashBankBizType } from '../common/enums'
import { decimalTransformer } from '../common/transformers/decimal.transformer'

/**
 * 现金银行单据（收 / 付 / 转账 / 费用报销 / 其他收入）
 * 每张单据自动生成一张记账凭证，通过 voucherId 关联。
 */
@Entity('fin_cash_flow')
export class CashFlow extends BaseEntity {
  @Column({ length: 20, comment: '业务类型：receipt/payment/transfer/expense/income' })
  bizType: CashBankBizType | string

  @Column({ name: 'biz_date', type: 'date', comment: '业务日期' })
  bizDate: string

  @Column({ name: 'bank_account_id', type: 'varchar', comment: '资金账户ID（收付方）' })
  bankAccountId: string

  @Column({ name: 'bank_account_name', length: 100, comment: '资金账户名称快照' })
  bankAccountName: string

  @Column({ name: 'account_id', type: 'varchar', nullable: true, comment: '对方会计科目ID' })
  accountId: string | null

  @Column({ name: 'account_name', length: 100, nullable: true, comment: '对方科目名称快照' })
  accountName: string | null

  /** 转账时的转入账户 */
  @Column({ name: 'to_bank_account_id', type: 'varchar', nullable: true })
  toBankAccountId: string | null

  @Column({ name: 'to_bank_account_name', length: 100, nullable: true })
  toBankAccountName: string | null

  @Column({ name: 'to_account_id', type: 'varchar', nullable: true, comment: '转入账户对应科目ID' })
  toAccountId: string | null

  @Column({ name: 'partner_id', type: 'varchar', nullable: true })
  partnerId: string | null

  @Column({ name: 'department_id', type: 'varchar', nullable: true })
  departmentId: string | null

  @Column({ name: 'project_id', type: 'varchar', nullable: true })
  projectId: string | null

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  amount: number

  @Column({ length: 200, default: '', comment: '摘要' })
  summary: string

  @Column({ name: 'voucher_id', type: 'varchar', nullable: true, comment: '生成的凭证ID' })
  voucherId: string | null

  @Column({ name: 'created_by', type: 'varchar', nullable: true })
  createdBy: string | null

  @Column({ name: 'created_by_name', length: 50, nullable: true })
  createdByName: string | null

  @Column({ length: 200, nullable: true })
  remark: string | null
}

/** 往来核销记录 */
@Entity('fin_write_off')
@Index('idx_write_off_partner', ['partnerId', 'type'])
export class WriteOff extends BaseEntity {
  @Column({ length: 20, comment: '核销类型：receivable 应收 / payable 应付' })
  type: string

  @Column({ name: 'partner_id', type: 'varchar', comment: '往来单位ID' })
  partnerId: string

  @Column({ name: 'partner_name', length: 100, comment: '往来单位名称快照' })
  partnerName: string

  @Column({ name: 'biz_date', type: 'date', comment: '核销日期' })
  bizDate: string

  @Column({ name: 'bank_account_id', type: 'varchar', comment: '收付款资金账户ID' })
  bankAccountId: string

  @Column({ name: 'bank_account_name', length: 100 })
  bankAccountName: string

  @Column({ name: 'account_id', type: 'varchar', nullable: true, comment: '应收/应付科目ID' })
  accountId: string | null

  @Column({ name: 'account_name', length: 100, nullable: true })
  accountName: string | null

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  amount: number

  @Column({ length: 200, default: '', comment: '摘要' })
  summary: string

  @Column({ name: 'voucher_id', type: 'varchar', nullable: true })
  voucherId: string | null

  @Column({ name: 'created_by', type: 'varchar', nullable: true })
  createdBy: string | null

  @Column({ name: 'created_by_name', length: 50, nullable: true })
  createdByName: string | null

  @Column({ length: 200, nullable: true })
  remark: string | null
}

/** 其他收支单据 */
@Entity('fin_income_expense')
export class IncomeExpense extends BaseEntity {
  @Column({ length: 20, comment: '类型：income 收入 / expense 支出' })
  bizType: string

  @Column({ name: 'biz_date', type: 'date' })
  bizDate: string

  @Column({ name: 'bank_account_id', type: 'varchar', nullable: true, comment: '收付款账户ID' })
  bankAccountId: string | null

  @Column({ name: 'bank_account_name', length: 100, nullable: true })
  bankAccountName: string | null

  @Column({ name: 'account_id', type: 'varchar', comment: '收入/费用科目ID' })
  accountId: string

  @Column({ name: 'account_name', length: 100 })
  accountName: string

  @Column({ name: 'partner_id', type: 'varchar', nullable: true })
  partnerId: string | null

  @Column({ name: 'department_id', type: 'varchar', nullable: true })
  departmentId: string | null

  @Column({ name: 'project_id', type: 'varchar', nullable: true })
  projectId: string | null

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  amount: number

  @Column({ length: 200, default: '', comment: '摘要' })
  summary: string

  @Column({ name: 'voucher_id', type: 'varchar', nullable: true })
  voucherId: string | null

  @Column({ name: 'created_by', type: 'varchar', nullable: true })
  createdBy: string | null

  @Column({ name: 'created_by_name', length: 50, nullable: true })
  createdByName: string | null

  @Column({ length: 200, nullable: true })
  remark: string | null
}