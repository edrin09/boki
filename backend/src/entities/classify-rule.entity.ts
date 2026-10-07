import { Column, Entity, Index } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 票据归类规则（P17.1 / P17.6）
 * 命中规则后按 targetAccountCode 生成费用/收入科目，
 * 规则可维护、可启用停用、修正回写生成 learned 规则。
 */
@Entity('fin_classify_rule')
export class ClassifyRule extends BaseEntity {
  @Column({ name: 'rule_name', length: 100, comment: '规则名称' })
  ruleName: string

  /** keyword：按关键词匹配文本；partner：按交易对手名称匹配 */
  @Column({ name: 'match_type', length: 20, default: 'keyword', comment: '匹配方式：keyword/partner' })
  matchType: string

  /** keyword 时为关键词（支持逗号分隔多个）；partner 时为交易对手名称子串 */
  @Column({ name: 'match_value', length: 300, comment: '匹配值' })
  matchValue: string

  /** 凭证模板：expense 费用 / income 收入 */
  @Column({ length: 20, default: 'expense', comment: '凭证模板类型：expense/income' })
  kind: string

  @Index('uk_classify_rule_account')
  @Column({ name: 'target_account_code', length: 20, comment: '目标科目编码' })
  targetAccountCode: string

  @Column({ name: 'target_account_name', length: 100, nullable: true, comment: '目标科目名称（冗余）' })
  targetAccountName: string | null

  @Column({ type: 'int', default: 0, comment: '优先级，越大越先命中' })
  priority: number

  @Column({ type: 'int', default: 1, comment: '启用：1 启用 0 停用' })
  enabled: number

  @Column({ name: 'hit_count', type: 'int', default: 0, comment: '命中次数' })
  hitCount: number

  /** 修正回写生成的规则（来源 learned），可被用户识别与删除 */
  @Column({ type: 'boolean', default: false, comment: '是否修正回写自动生成' })
  learned: boolean

  @Column({ length: 200, nullable: true, comment: '备注' })
  remark: string | null
}
