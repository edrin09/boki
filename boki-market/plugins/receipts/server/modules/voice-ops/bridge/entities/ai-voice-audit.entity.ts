import { Column, Entity, Index } from 'typeorm'
import { BaseEntity } from '@core/entities/base.entity'

/**
 * AI 指令审计（唯一新增表）。
 *
 * 只做留痕，不承载业务：凭证/工资单/员工仍落在各自业务表与状态机里。
 * 方案 §8 要求记录：原话、动作、参数、预览 hash、执行结果、操作人、时间。
 */
@Entity('fin_ai_voice_audit')
export class AiVoiceAudit extends BaseEntity {
  @Index('idx_ai_voice_audit_company')
  @Column({ name: 'company_id', type: 'varchar', length: 36, default: '' })
  companyId: string

  @Column({ name: 'user_id', type: 'varchar', length: 36, default: '' })
  userId: string

  @Column({ name: 'user_name', type: 'varchar', length: 50, default: '' })
  userName: string

  /** 入口来源：voice 语音 / text 文字 */
  @Column({ type: 'varchar', length: 10, default: 'text' })
  source: string

  /** 用户原话（按数据处理，不拼进 system prompt） */
  @Column({ type: 'text', nullable: true })
  transcript: string | null

  @Column({ type: 'varchar', length: 50, default: '' })
  action: string

  @Column({ name: 'args_json', type: 'text', nullable: true })
  argsJson: string | null

  @Column({ name: 'preview_hash', type: 'varchar', length: 64, default: '' })
  previewHash: string

  /** planned / committed / cancelled / failed */
  @Index('idx_ai_voice_audit_status')
  @Column({ type: 'varchar', length: 20, default: 'planned' })
  status: string

  @Column({ name: 'result_json', type: 'text', nullable: true })
  resultJson: string | null

  @Column({ type: 'varchar', length: 500, nullable: true })
  message: string | null

  @Index('idx_ai_voice_audit_token')
  @Column({ type: 'varchar', length: 64, default: '' })
  token: string
}
