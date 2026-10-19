import { Column, Entity, Index } from 'typeorm'
import { BaseEntity } from './base.entity'
import { decimalTransformer } from '../common/transformers/decimal.transformer'

/** 固定费用频率 */
export const FIXED_EXPENSE_FREQUENCIES = {
  ONCE: 'once', // 一次性
  MONTHLY: 'monthly', // 每月
  QUARTERLY: 'quarterly', // 每季度
  YEARLY: 'yearly', // 每年
} as const

/** 固定费用模板：一次性录入，周期性自动生成支出凭证 */
@Entity('fin_fixed_expense')
export class FixedExpense extends BaseEntity {
  @Index('idx_fixed_expense_company')
  @Column({ name: 'company_id', type: 'varchar', length: 36, default: '' })
  companyId: string

  @Column({ length: 100, comment: '费用名称' })
  name: string

  @Column({ length: 20, default: 'monthly', comment: '频率 once/monthly/quarterly/yearly' })
  frequency: string

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  amount: number

  @Column({ name: 'account_id', type: 'varchar', comment: '费用科目ID' })
  accountId: string

  @Column({ name: 'account_name', length: 100 })
  accountName: string

  @Column({ name: 'bank_account_id', type: 'varchar', nullable: true, comment: '支付账户ID' })
  bankAccountId: string | null

  @Column({ name: 'bank_account_name', length: 100, nullable: true })
  bankAccountName: string | null

  @Column({ name: 'partner_id', type: 'varchar', nullable: true })
  partnerId: string | null

  @Column({ name: 'department_id', type: 'varchar', nullable: true })
  departmentId: string | null

  @Column({ name: 'project_id', type: 'varchar', nullable: true })
  projectId: string | null

  @Column({ name: 'biz_day', type: 'int', default: 1, comment: '每月扣费日 1-31' })
  bizDay: number

  @Column({ name: 'start_date', type: 'date', comment: '生效起始日' })
  startDate: string

  @Column({ name: 'end_date', type: 'date', nullable: true, comment: '失效日期，空为长期' })
  endDate: string | null

  @Column({
    name: 'auto_approve',
    type: 'int',
    default: 1,
    comment: '生成的凭证是否自动审核 1/0',
  })
  autoApprove: boolean | number

  @Column({ type: 'int', default: 1, comment: '状态 1 启用 / 0 停用' })
  status: number

  @Column({ length: 200, nullable: true })
  remark: string | null
}

/** 固定费用生成记录：模板+期间唯一，保证幂等 */
@Entity('fin_fixed_expense_log')
@Index('uq_fixed_expense_log_tpl_period', ['templateId', 'period'], { unique: true })
export class FixedExpenseLog extends BaseEntity {
  @Index('idx_fixed_expense_log_company')
  @Column({ name: 'company_id', type: 'varchar', length: 36, default: '' })
  companyId: string

  @Column({ name: 'template_id', type: 'varchar' })
  templateId: string

  @Column({ type: 'varchar', length: 7, comment: '所属期间 YYYY-MM' })
  period: string

  @Column({ name: 'biz_date', type: 'date' })
  bizDate: string

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  amount: number

  @Column({ name: 'income_expense_id', type: 'varchar', nullable: true })
  incomeExpenseId: string | null

  @Column({ name: 'voucher_id', type: 'varchar', nullable: true })
  voucherId: string | null
}
