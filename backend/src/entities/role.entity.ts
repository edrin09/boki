import { Column, Entity, Index, ManyToMany, JoinTable } from 'typeorm'
import { BaseEntity } from './base.entity'
import { Permission } from './permission.entity'
import { User } from './user.entity'

/**
 * 角色
 */
@Entity('sys_role')
export class Role extends BaseEntity {
  @Index('uk_role_code', { unique: true })
  @Column({ length: 50, comment: '角色标识，如 admin' })
  code: string

  @Column({ length: 50, comment: '角色名称' })
  name: string

  @Column({ length: 200, nullable: true, comment: '描述' })
  description: string | null

  @Column({ name: 'is_system', type: 'boolean', default: false, comment: '是否系统内置（内置不可删除）' })
  isSystem: boolean

  @Column({ name: 'sort', type: 'int', default: 0 })
  sort: number

  @ManyToMany(() => Permission, { cascade: false })
  @JoinTable({
    name: 'sys_role_permission',
    joinColumn: { name: 'role_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permission_id', referencedColumnName: 'id' },
  })
  permissions: Permission[]

  /** 拥有该角色的用户（反向关系） */
  @ManyToMany(() => User, (user) => user.roles)
  users: User[]
}