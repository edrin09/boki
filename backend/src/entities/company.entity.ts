import { Column, Entity, Index } from 'typeorm'
import { BaseEntity } from './base.entity'
import { decimalTransformer } from '../common/transformers/decimal.transformer'

/**
 * 记账公司（账套）
 *
 * 多公司记账的顶层隔离单位：所有业务数据（fin_* 表）都带 company_id，
 * 接口层通过 JWT 中的 companyId 自动过滤，互不可见。
 */
@Entity('sys_company')
export class Company extends BaseEntity {
  @Index('uk_company_code', { unique: true })
  @Column({ length: 30, comment: '公司编码（全局唯一）' })
  code: string

  @Column({ length: 100, comment: '公司名称' })
  name: string

  @Column({ name: 'tax_no', length: 50, nullable: true, comment: '纳税人识别号（票据方向判定依据）' })
  taxNo: string | null

  @Column({
    name: 'taxpayer_type',
    length: 20,
    default: 'small_scale',
    comment: '纳税人类型：small_scale 小规模 / general 一般纳税人',
  })
  taxpayerType: string

  @Column({
    name: 'vat_rate',
    type: 'decimal',
    precision: 6,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
    comment: '默认增值税征收率（小规模适用，一般纳税人为 0）',
  })
  vatRate: number | null

  @Column({
    name: 'tax_declare_cycle',
    length: 10,
    default: 'month',
    comment: '增值税申报周期：month 月报 / quarter 季报',
  })
  taxDeclareCycle: string

  @Column({
    name: 'auto_post_threshold',
    type: 'decimal',
    precision: 4,
    scale: 2,
    default: 0.8,
    transformer: decimalTransformer,
    comment: '自动生成凭证草稿的置信度阈值（0-1），低于该值需人工确认',
  })
  autoPostThreshold: number

  @Column({
    name: 'auto_post_enabled',
    type: 'int',
    default: 1,
    comment: '是否上传即自动生成凭证草稿：1 开启 0 关闭',
  })
  autoPostEnabled: number

  @Column({ name: 'legal_person', length: 50, nullable: true, comment: '法定代表人' })
  legalPerson: string | null

  @Column({ length: 50, nullable: true, comment: '所属行业' })
  industry: string | null

  @Column({ length: 200, nullable: true, comment: '注册地址' })
  address: string | null

  @Column({ name: 'bank_name', length: 100, nullable: true, comment: '开户行' })
  bankName: string | null

  @Column({ name: 'bank_account', length: 50, nullable: true, comment: '银行账号' })
  bankAccount: string | null

  @Column({
    name: 'fiscal_start_month',
    type: 'int',
    default: 1,
    comment: '会计年度起始月份 1-12',
  })
  fiscalStartMonth: number

  @Column({ type: 'int', default: 1, comment: '状态：1 启用 0 停用' })
  status: number

  @Column({ length: 200, nullable: true, comment: '备注' })
  remark: string | null
}