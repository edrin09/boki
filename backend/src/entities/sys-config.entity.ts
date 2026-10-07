import { Column, Entity, Index } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 系统参数配置（key-value）
 * P17.2：本公司纳税人识别号等方向判定所需信息
 */
@Entity('sys_config')
export class SysConfig extends BaseEntity {
  @Index('uk_sys_config_key', { unique: true })
  @Column({ length: 50, comment: '配置键' })
  key: string

  @Column({ type: 'text', nullable: true, comment: '配置值' })
  value: string | null

  @Column({ length: 100, nullable: true, comment: '说明' })
  remark: string | null
}
