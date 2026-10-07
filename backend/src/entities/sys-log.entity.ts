import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * 操作日志
 */
@Entity('sys_log')
export class SysLog {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId: string | null

  @Column({ length: 50, nullable: true })
  username: string | null

  @Column({ length: 50, nullable: true, comment: '模块' })
  module: string | null

  @Column({ length: 100, nullable: true, comment: '操作描述' })
  action: string | null

  @Column({ length: 10, nullable: true, comment: '请求方式' })
  method: string | null

  @Column({ length: 200, nullable: true, comment: '请求路径' })
  path: string | null

  @Column({ type: 'text', nullable: true, comment: '请求参数' })
  params: string | null

  @Column({ length: 50, nullable: true })
  ip: string | null

  @Column({ name: 'user_agent', length: 300, nullable: true })
  userAgent: string | null

  @Column({ type: 'boolean', default: true, comment: '是否成功' })
  success: boolean

  @Column({ name: 'error_msg', type: 'text', nullable: true })
  errorMsg: string | null

  @Column({ type: 'int', default: 0, comment: '耗时(ms)' })
  duration: number

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date
}