/**
 * AI 操作中间层 · 协议定义（内核，长期稳定）。
 *
 * 这里是唯一需要长期稳定的东西：动作清单、预演、执行。
 * 业务语义（科目、税率、借贷方向）一律不写在这层，写在插件的动作适配器里。
 *
 * 从 `receipts` 插件下沉（W1）：动作清单不再由单个插件私有，
 * 任何插件都能注册动作，插件之间无需互相 import。
 */

/** 参数可解析的档案类型：网关只做格式校验，名称→ID 由适配器完成 */
export type ResolveKind =
  | 'account'
  | 'partner'
  | 'employee'
  | 'department'
  | 'bankAccount'
  | 'voucher'

export type ParamType = 'number' | 'string' | 'date' | 'enum'

/** 单个参数定义：只描述业务语义，不出现数据库字段名 */
export interface ParamSpec {
  type: ParamType
  /** 界面标签；缺省回退字段名 */
  label?: string
  required?: boolean
  /** 用户是否可在此字段上直接改（决定 commit 的 patch 白名单） */
  editable?: boolean
  /** 名称 → 档案 ID 的解析提示 */
  resolve?: ResolveKind
  enum?: string[]
  /** 缺省值：'today' 表示当天 */
  default?: unknown
  min?: number
  description?: string
}

/**
 * 动作落点（安全模型核心，见方案 §4）。
 *
 * 只允许三种，**没有 `direct`**：
 * - `draft`   生成业务草稿（凭证 / 单据 / 工资单），人工审核后才生效；
 * - `list`    只生成待办清单，状态推进由用户逐条点击完成；
 * - `archive` 档案类（员工 / 客户 / 供应商）：无草稿态、无资金影响，
 *             以「确认卡片 + 审计留痕 + 可改可停用」等价替代（方案 §4.3）。
 */
export type AiLanding = 'draft' | 'list' | 'archive'

/** landing 白名单：注册期校验用，故意不提供 direct */
export const AI_LANDINGS: readonly AiLanding[] = ['draft', 'list', 'archive'] as const

/** 动作分组：用于召回时按域过滤（W4） */
export type AiActionGroup = 'bookkeeping' | 'hr' | 'fund' | 'doc' | 'query'

/** 动作清单项（模型看到的就是这份，不含任何库表/主键信息） */
export interface ActionManifest {
  id: string
  title: string
  description: string
  /** 落点：未声明或非法值在注册期直接失败 */
  landing: AiLanding
  /** 分组，召回时先按域筛（W4）；缺省视为 bookkeeping */
  group?: AiActionGroup
  /** 口语别名，召回打分用（W4） */
  aliases?: string[]
  params: Record<string, ParamSpec>
  examples: string[]
  /** 执行时的二次权限校验（不在模型侧判断）；`@docType` 表示取单据类型定义的权限 */
  permission: string
  /** 需要人工复核的金额字段：超阈值时预览卡片给出高风险警告 */
  amountField?: string
  /** 该动作是否可能一次处理多条（审核类） */
  batch?: boolean
}

/**
 * 字段的控件类型：预览卡片据此选控件，避免所有字段都退化成输入框。
 * 只描述「怎么填」，不含任何业务判断。
 */
export type PreviewFieldKind =
  | 'text'
  | 'date'
  | 'amount'
  | 'account'
  | 'partner'
  | 'department'
  | 'project'
  | 'employee'
  /** 枚举：候选来自 field.options（如结算方式 现金/银行） */
  | 'enum'

/** 下拉候选（目前只用于科目：推荐项排在全部明细科目之前） */
export interface PreviewOption {
  value: string
  label: string
  /** 推荐理由，如「还没开票/收款，先挂应收」 */
  hint?: string
}

export interface PreviewField {
  key?: string
  label: string
  value: string
  editable: boolean
  /** 控件类型；缺省按 text 处理 */
  kind?: PreviewFieldKind
  /** 推荐候选：前端置顶成「推荐」分组，首选即当前预填值 */
  options?: PreviewOption[]
  placeholder?: string
  /**
   * 留空时的语义（如「全部（不限部门）」）。
   * 有值则前端在下拉顶部多给一个空值选项，用户选了就等于「不筛选」，
   * 不必靠清空按钮猜。
   */
  emptyLabel?: string
}

export interface PreviewLine {
  account: string
  debit: number
  credit: number
  aux?: string
}

export interface PreviewItem {
  id?: string
  no?: string
  date?: string
  summary?: string
  amount?: number
  status?: string
}

export interface PreviewMissing {
  field: string
  label: string
  type?: ResolveKind
}

/** 通用预演结构：一套 UI 渲染所有动作 */
export interface Preview {
  title: string
  summary: string
  fields: PreviewField[]
  /** 分录行只读，防止在界面上改出不平的分录 */
  lines: PreviewLine[]
  missing: PreviewMissing[]
  warnings: string[]
  items?: PreviewItem[]
}

/** 模型编译结果 */
export interface CompiledInstruction {
  action: string
  args: Record<string, unknown>
  /** 信息不足时的追问话术（模型侧生成，仅用于展示） */
  ask?: string
}

/** plan 返回 */
export interface PlanResult {
  planId: string
  action: string
  title: string
  /** 落点：draft 草稿 / list 待办清单 / archive 档案；前端据此标「草稿」等标识 */
  landing?: AiLanding
  args: Record<string, unknown>
  missing: PreviewMissing[]
  preview: Preview
  token: string
  expiresAt: string
  /** 模型追问（缺参时用于口语提示） */
  ask?: string
}

/** commit 返回 */
export interface CommitResult {
  ok: boolean
  result: Record<string, unknown>
  auditId: string
  /** 重复提交同一 token 时为 true（不重复入账） */
  idempotent?: boolean
}

/** 适配器执行上下文 */
export interface ActionContext {
  operator: { id: string; nickname: string }
  /** 当前用户权限码，适配器可按需再判 */
  permissions: string[]
  /** 业务日期（YYYY-MM-DD） */
  today: string
  /** 用户原话，仅供审计与警告文案使用，禁止拼进业务判断 */
  text: string
  /** plan 阶段来源：voice / text */
  source: 'voice' | 'text'
}

/**
 * 应用适配器契约（方案 §3.3）。
 *
 * 三条硬规则：
 * 1. preview 必须无副作用，只读；
 * 2. commit 必须复用现有业务 service，不允许另写 SQL；
 * 3. 业务规则（科目映射、借贷方向、审批）全部在这里，不写进 prompt。
 */
export interface ActionAdapter {
  manifest: ActionManifest
  preview(args: Record<string, unknown>, ctx: ActionContext): Promise<Preview>
  commit(args: Record<string, unknown>, ctx: ActionContext): Promise<Record<string, unknown>>
}

/** 令牌载荷（服务端保存，客户端只拿 token 与预览） */
export interface TokenPayload {
  token: string
  planId: string
  action: string
  args: Record<string, unknown>
  previewHash: string
  companyId: string
  userId: string
  source: 'voice' | 'text'
  text: string
  /** plan 阶段确定的「今天」（用户本地日期），commit 复用，避免跨零点前后不一致 */
  today?: string
  /** 审计记录 ID：commit 时回写状态 */
  auditId?: string
  createdAt: number
  expiresAt: number
  /** 已执行结果：用于幂等 */
  committed?: Record<string, unknown>
  cancelled?: boolean
}
