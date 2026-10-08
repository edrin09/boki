import { Column, Entity, Index } from 'typeorm'
import { BaseEntity } from './base.entity'
import { PartnerType } from '../common/enums'

/**
 * 往来单位（客户 / 供应商）
 */
@Entity('fin_partner')
@Index('uk_partner_code', ['companyId', 'code'], { unique: true })
export class Partner extends BaseEntity {
  @Index('idx_partner_company')
  @Column({ name: 'company_id', type: 'varchar', length: 36, default: '' })
  companyId: string

  @Column({ length: 30, comment: '编码' })
  code: string

  @Column({ length: 100, comment: '名称' })
  name: string

  @Column({ length: 20, default: 'customer', comment: '类型：customer/supplier/both' })
  type: PartnerType

  @Column({ length: 50, nullable: true, comment: '联系人' })
  contact: string | null

  @Column({ length: 30, nullable: true, comment: '电话' })
  phone: string | null

  @Column({ length: 100, nullable: true, comment: '邮箱' })
  email: string | null

  @Column({ length: 200, nullable: true, comment: '地址' })
  address: string | null

  @Column({ length: 50, nullable: true, comment: '税号' })
  taxNo: string | null

  @Column({ name: 'legal_person', length: 50, nullable: true, comment: '法定代表人' })
  legalPerson: string | null

  @Column({ name: 'bank_name', length: 100, nullable: true })
  bankName: string | null

  @Column({ name: 'bank_account', length: 50, nullable: true })
  bankAccount: string | null

  @Column({ length: 200, nullable: true, comment: '备注' })
  remark: string | null

  @Column({ type: 'int', default: 1, comment: '状态：1 启用 0 禁用' })
  status: number
}