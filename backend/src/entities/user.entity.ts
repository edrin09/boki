import { Column, Entity, Index, JoinTable, ManyToMany } from 'typeorm'
import { BaseEntity } from './base.entity'
import { Role } from './role.entity'

/**
 * 用户
 */
@Entity('sys_user')
export class User extends BaseEntity {
  @Index('uk_user_username', { unique: true })
  @Column({ length: 50, comment: '登录账号' })
  username: string

  @Column({ length: 120, select: false, comment: '密码哈希' })
  password: string

  @Column({ length: 50, comment: '姓名/昵称' })
  nickname: string

  @Column({ length: 100, nullable: true, comment: '邮箱' })
  email: string | null

  @Column({ length: 30, nullable: true, comment: '手机号' })
  phone: string | null

  @Column({ type: 'int', default: 1, comment: '状态：1 启用 0 禁用' })
  status: number

  @Column({ name: 'last_login_at', type: 'datetime', nullable: true })
  lastLoginAt: Date | null

  @Column({ name: 'last_login_ip', length: 50, nullable: true })
  lastLoginIp: string | null

  @Column({ length: 200, nullable: true })
  remark: string | null

  /** 拥有的角色（拥有方，定义连接表） */
  @ManyToMany(() => Role, (role) => role.users)
  @JoinTable({
    name: 'sys_user_role',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' },
  })
  roles: Role[]
}