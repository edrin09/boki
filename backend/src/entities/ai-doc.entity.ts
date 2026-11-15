import { Column, Entity, Index } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * AI 单据类型配置（W7）：按公司覆盖插件注册的 `DocTypeDef` 的展示层。
 *
 * 硬约束（写在校验里，不靠约定）：
 * - 只能改「问什么、叫什么」（标题、字段标签/必填、别名/口语样本），
 *   **不能改「调什么」** —— 表里不存 URL / SQL / service 名；
 * - 类型本身必须已由插件注册，未注册的 key 不允许在这里新增；
 * - 新字段必须已在该类型的 `fields` 白名单里。
 */
@Entity('fin_ai_doc_type')
@Index('uk_ai_doc_type_company_key', ['companyId', 'key'], { unique: true })
export class AiDocTypeConfig extends BaseEntity {
  @Index('idx_ai_doc_type_company')
  @Column({ name: 'company_id', type: 'varchar', length: 36, default: '' })
  companyId: string

  /** 单据类型 key，如 loan；必须已由插件注册 */
  @Column({ type: 'varchar', length: 50 })
  key: string

  /** 归属插件（冗余存一份，便于排错；不允许修改） */
  @Column({ type: 'varchar', length: 50, default: '' })
  plugin: string

  /** 展示名，可覆盖插件默认值 */
  @Column({ type: 'varchar', length: 60, default: '' })
  title: string

  /** 提交权限码，可覆盖插件默认值 */
  @Column({ type: 'varchar', length: 80, default: '' })
  permission: string

  /** 字段覆盖：{ fieldKey: { label?, required?, description? } }，仅白名单内字段生效 */
  @Column({ name: 'fields_json', type: 'text', nullable: true })
  fieldsJson: string | null

  /** 1 启用 / 0 停用（停用后该类型不进 prompt、不可提交） */
  @Column({ type: 'int', default: 1 })
  enabled: number
}

/**
 * AI 动作口语别名与样本（W7）：不发版即可补充说法。
 *
 * 只参与召回与 few-shot，不改变任何执行逻辑 —— 别名说得再花，
 * 落点仍然是草稿。
 */
@Entity('fin_ai_action_alias')
export class AiActionAlias extends BaseEntity {
  @Index('idx_ai_alias_company')
  @Column({ name: 'company_id', type: 'varchar', length: 36, default: '' })
  companyId: string

  /** 归属单据类型 key（如 loan）；也允许 'doc.submit' 表示通用入口 */
  @Column({ name: 'doc_type_key', type: 'varchar', length: 50, default: 'doc.submit' })
  docTypeKey: string

  /** 口语别名，如「备用金」 */
  @Column({ type: 'varchar', length: 50 })
  alias: string

  /** 完整口语句子（可选），用于 few-shot */
  @Column({ name: 'sample_text', type: 'varchar', length: 200, nullable: true })
  sampleText: string | null

  /** 该句子的期望参数（可选，JSON） */
  @Column({ name: 'sample_args', type: 'text', nullable: true })
  sampleArgs: string | null
}
