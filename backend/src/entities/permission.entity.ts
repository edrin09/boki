import { Column, Entity, Index } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 权限（RBAC）
 */
@Entity('sys_permission')
export class Permission extends BaseEntity {
  @Index('uk_permission_code', { unique: true })
  @Column({ length: 100, comment: '权限标识，如 voucher:create' })
  code: string

  @Column({ length: 50, comment: '权限名称' })
  name: string

  @Column({ length: 50, comment: '所属模块' })
  module: string

  @Column({ length: 10, default: 'action', comment: '类型：menu 菜单 / action 操作' })
  type: string

  @Column({ name: 'parent_id', type: 'varchar', nullable: true, comment: '父权限ID' })
  parentId: string | null

  @Column({ length: 200, nullable: true, comment: '前端路由地址' })
  path: string | null

  @Column({ length: 50, nullable: true, comment: '前端图标' })
  icon: string | null

  @Column({ name: 'sort', type: 'int', default: 0, comment: '排序' })
  sort: number

  @Column({ length: 200, nullable: true, comment: '备注' })
  remark: string | null
}