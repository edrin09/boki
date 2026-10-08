import { Column, Entity, Index } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 项目（辅助核算维度）
 */
@Entity('fin_project')
@Index('uk_project_code', ['companyId', 'code'], { unique: true })
export class Project extends BaseEntity {
  @Index('idx_project_company')
  @Column({ name: 'company_id', type: 'varchar', length: 36, default: '' })
  companyId: string

  @Column({ length: 30, comment: '编码' })
  code: string

  @Column({ length: 100, comment: '名称' })
  name: string

  @Column({ name: 'manager', length: 50, nullable: true, comment: '负责人' })
  manager: string | null

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: string | null

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string | null

  @Column({ length: 200, nullable: true })
  remark: string | null

  @Column({ type: 'int', default: 1 })
  status: number
}