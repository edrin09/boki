import { Column, Entity, Index } from 'typeorm'
import { BaseEntity } from './base.entity'
import { BalanceDirection } from '../common/enums'
import { decimalTransformer } from '../common/transformers/decimal.transformer'

/**
 * 期初余额（按会计年度 + 科目 + 辅助核算组合）
 */
@Entity('fin_initial_balance')
@Index(
  'uk_initial_balance',
  ['companyId', 'fiscalYear', 'accountId', 'partnerId', 'departmentId', 'projectId'],
  { unique: true },
)
export class InitialBalance extends BaseEntity {
  @Index('idx_initial_balance_company')
  @Column({ name: 'company_id', type: 'varchar', length: 36, default: '' })
  companyId: string

  @Column({ name: 'fiscal_year', type: 'int', comment: '会计年度，如 2026' })
  fiscalYear: number

  @Column({ name: 'account_id', type: 'varchar', comment: '会计科目ID' })
  accountId: string

  @Column({ name: 'account_code', length: 20 })
  accountCode: string

  @Column({ name: 'account_name', length: 100 })
  accountName: string

  @Column({ name: 'partner_id', type: 'varchar', nullable: true, comment: '往来单位ID' })
  partnerId: string | null

  @Column({ name: 'department_id', type: 'varchar', nullable: true, comment: '部门ID' })
  departmentId: string | null

  @Column({ name: 'project_id', type: 'varchar', nullable: true, comment: '项目ID' })
  projectId: string | null

  @Column({ length: 10, default: 'debit', comment: '期初余额方向：debit/credit' })
  direction: BalanceDirection

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  amount: number

  @Column({ length: 200, nullable: true })
  remark: string | null
}