import { Column, Entity, Index } from 'typeorm'
import { BaseEntity } from './base.entity'
import { AccountCategory, AuxiliaryType, BalanceDirection } from '../common/enums'

/**
 * 会计科目（多级科目树）
 */
@Entity('fin_account')
@Index('uk_account_code', ['companyId', 'code'], { unique: true })
export class Account extends BaseEntity {
  @Index('idx_account_company')
  @Column({ name: 'company_id', type: 'varchar', length: 36, default: '' })
  companyId: string

  @Column({ length: 20, comment: '科目编码' })
  code: string

  @Column({ length: 100, comment: '科目名称' })
  name: string

  @Column({ name: 'full_name', length: 200, comment: '全名，如：资产.货币资金.库存现金' })
  fullName: string

  @Column({ length: 20, comment: '科目类别：asset/liability/equity/cost/profit' })
  category: AccountCategory

  @Column({ type: 'int', default: 1, comment: '级次：1~4' })
  level: number

  @Column({ length: 10, comment: '余额方向：debit 借方 / credit 贷方' })
  direction: BalanceDirection

  @Column({ name: 'parent_id', type: 'varchar', nullable: true })
  parentId: string | null

  @Column({ name: 'is_leaf', type: 'boolean', default: true, comment: '是否明细科目' })
  isLeaf: boolean

  @Column({ name: 'auxiliary_types', type: 'simple-json', nullable: true, comment: '辅助核算维度数组' })
  auxiliaryTypes: AuxiliaryType[] | null

  @Column({ name: 'is_cash', type: 'boolean', default: false, comment: '是否现金科目' })
  isCash: boolean

  @Column({ name: 'is_bank', type: 'boolean', default: false, comment: '是否银行科目' })
  isBank: boolean

  @Column({ type: 'int', default: 1, comment: '状态：1 启用 0 禁用' })
  status: number

  @Column({ type: 'int', default: 0 })
  sort: number

  @Column({ length: 200, nullable: true })
  remark: string | null
}