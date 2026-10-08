import { Column, Entity, Index } from 'typeorm'
import { BaseEntity } from './base.entity'
import { decimalTransformer } from '../common/transformers/decimal.transformer'

/**
 * 凭证分录（明细行）
 * 说明：与凭证的关联使用显式的 voucher_id 外键列，不使用 ORM 关联装饰器，
 * 避免列名歧义；删除凭证时由服务层显式删除分录。
 */
@Entity('fin_voucher_entry')
@Index('idx_entry_voucher', ['voucherId'])
@Index('idx_entry_account', ['accountId'])
export class VoucherEntry extends BaseEntity {
  @Index('idx_entry_company')
  @Column({ name: 'company_id', type: 'varchar', length: 36, default: '' })
  companyId: string

  @Column({ name: 'voucher_id', type: 'varchar' })
  voucherId: string

  @Column({ length: 200, default: '', comment: '摘要' })
  summary: string

  @Column({ name: 'account_id', type: 'varchar', comment: '会计科目ID' })
  accountId: string

  @Column({ name: 'account_code', length: 20, comment: '科目编码快照' })
  accountCode: string

  @Column({ name: 'account_name', length: 100, comment: '科目名称快照' })
  accountName: string

  @Column({ name: 'partner_id', type: 'varchar', nullable: true, comment: '往来单位' })
  partnerId: string | null

  @Column({ name: 'department_id', type: 'varchar', nullable: true, comment: '部门' })
  departmentId: string | null

  @Column({ name: 'project_id', type: 'varchar', nullable: true, comment: '项目' })
  projectId: string | null

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  debit: number

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  credit: number

  @Column({ type: 'int', default: 0, comment: '行号' })
  sort: number
}