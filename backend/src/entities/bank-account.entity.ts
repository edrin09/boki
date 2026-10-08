import { Column, Entity, Index } from 'typeorm'
import { BaseEntity } from './base.entity'
import { BankAccountType } from '../common/enums'

/**
 * 资金账户（库存现金 / 银行存款）
 */
@Entity('fin_bank_account')
@Index('uk_bank_code', ['companyId', 'code'], { unique: true })
export class BankAccount extends BaseEntity {
  @Index('idx_bank_company')
  @Column({ name: 'company_id', type: 'varchar', length: 36, default: '' })
  companyId: string

  @Column({ length: 30, comment: '编码' })
  code: string

  @Column({ length: 100, comment: '账户名称' })
  name: string

  @Column({ length: 10, default: 'bank', comment: '类型：cash 现金 / bank 银行' })
  type: BankAccountType

  @Column({ length: 20, default: 'CNY', comment: '币种' })
  currency: string

  @Column({ name: 'account_code', length: 20, nullable: true, comment: '对应会计科目编码' })
  accountCode: string | null

  @Column({ length: 50, nullable: true, comment: '银行账号' })
  accountNo: string | null

  @Column({ name: 'bank_name', length: 100, nullable: true, comment: '开户行' })
  bankName: string | null

  @Column({ name: 'account_name', length: 100, nullable: true, comment: '开户名称' })
  accountName: string | null

  @Column({ length: 200, nullable: true })
  remark: string | null

  @Column({ type: 'int', default: 1, comment: '状态：1 启用 0 禁用' })
  status: number
}