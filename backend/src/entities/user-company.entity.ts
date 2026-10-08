import { Column, Entity, Index } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 用户 - 公司 关联（一个账号可管理多家公司）
 *
 * 用户与公司的权限关系：能进入某公司即可使用其全局角色（RBAC），
 * 因此这里只记录「可见性」，不再做公司级角色细分。
 */
@Entity('sys_user_company')
@Index('uk_user_company', ['userId', 'companyId'], { unique: true })
@Index('idx_user_company_company', ['companyId'])
export class UserCompany extends BaseEntity {
  @Column({ name: 'user_id', type: 'varchar', comment: '用户ID' })
  userId: string

  @Column({ name: 'company_id', type: 'varchar', comment: '公司ID' })
  companyId: string

  @Column({ name: 'is_owner', type: 'boolean', default: false, comment: '是否公司创建者（拥有管理权）' })
  isOwner: boolean

  @Column({ type: 'int', default: 1, comment: '状态：1 有效 0 已移除' })
  status: number
}