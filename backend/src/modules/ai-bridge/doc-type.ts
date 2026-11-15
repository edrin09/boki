import type { ActionContext, ParamSpec, Preview } from './protocol'

/**
 * 单据类型定义（W3）：把「一种业务单据」变成归属插件里的一段声明，
 * 而不是一个独立动作适配器。
 *
 * `doc.submit` 只有三段逻辑：按 docType 取定义 → 校验字段属于该类型 →
 * 委托 preview / submit。任何业务语义（科目、借贷方向、额度校验）
 * 都在这里实现，不进 prompt、不进内核。
 *
 * 硬约束（写在校验里，不靠约定）：
 * - `submit` 只能调业务 service 的「创建/更新」并落草稿，不得审核/发放/过账；
 * - 返回结果会过 `assertDraftOnly()`，出现已生效状态直接抛错。
 */
export interface DocTypeDef {
  /** 单据类型标识，如 'loan'（借款单）、'expense_claim'（报销单） */
  key: string
  /** 展示名，如「借款单」 */
  title: string
  /**
   * 插件注册时的原始标题。
   *
   * 只在公司配置覆盖了 `title` 时由 `AiDocTypeResolver` 补上——
   * 插件自己的卡片文案里写死了默认名，内核据此知道该替换成什么。
   */
  baseTitle?: string
  /** 归属插件 id，如 'hr'；用于审计与排错 */
  plugin: string
  /** 提交时二次校验的业务权限码，如 'hr:loan:create' */
  permission: string
  /** 该类型接受哪些字段（从 doc.submit 参数并集中取子集 + 专属字段） */
  fields: Record<string, ParamSpec>
  /** 事由提示语，如「备用金」「差旅预支」，用于召回与卡片建议 */
  purposeHints?: string[]
  /** 只读预演：算清额度、补齐默认值、产出卡片 */
  preview(args: Record<string, unknown>, ctx: ActionContext): Promise<Preview>
  /** 落草稿：必须复用现有业务 service */
  submit(args: Record<string, unknown>, ctx: ActionContext): Promise<Record<string, unknown>>
}
