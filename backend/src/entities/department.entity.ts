import { Column, Entity, Index } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 部门（辅助核算维度）
 */
@Entity('fin_department')
@Index('uk_department_code', ['companyId', 'code'], { unique: true })
export class Department extends BaseEntity {
  @Index('idx_department_company')
  @Column({ name: 'company_id', type: 'varchar', length: 36, default: '' })
  companyId: string

  @Column({ length: 30, comment: '编码' })
  code: string

  @Column({ length: 100, comment: '名称' })
  name: string

  @Column({ name: 'parent_id', type: 'varchar', nullable: true })
  parentId: string | null

  @Column({ length: 50, nullable: true, comment: '负责人' })
  manager: string | null

  @Column({ length: 200, nullable: true })
  remark: string | null

  @Column({ type: 'int', default: 1 })
  status: number
}