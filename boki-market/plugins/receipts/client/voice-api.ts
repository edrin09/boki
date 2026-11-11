import { post } from '@/api/http'

/** 与后端 bridge/protocol.ts 一一对应的前端类型（只保留卡片与提交用得到的部分） */

/** 字段控件类型：决定卡片上用下拉还是输入框 */
export type PreviewFieldKind =
  | 'text'
  | 'date'
  | 'amount'
  | 'account'
  | 'partner'
  | 'department'
  | 'project'
  | 'employee'

export interface PreviewOption {
  value: string
  label: string
  hint?: string
}

export interface PreviewField {
  key?: string
  label: string
  value: string
  editable: boolean
  kind?: PreviewFieldKind
  options?: PreviewOption[]
  placeholder?: string
  /** 留空时的语义（如「全部（不限部门）」），下拉顶部据此给一个空值选项 */
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
  type?: string
}

export interface Preview {
  title: string
  summary: string
  fields: PreviewField[]
  lines: PreviewLine[]
  missing: PreviewMissing[]
  warnings: string[]
  items?: PreviewItem[]
}

export interface PlanResult {
  planId?: string
  unsupported?: false
  action: string
  title?: string
  args: Record<string, unknown>
  missing: PreviewMissing[]
  preview: Preview
  token: string
  expiresAt: string
  ask?: string
}

export interface UnsupportedPlan {
  unsupported: true
  action: 'unsupported'
  ask: string
  title: string
}

export type PlanOutcome = PlanResult | UnsupportedPlan

export interface CommitResult {
  ok: boolean
  result: Record<string, unknown>
  auditId: string
  idempotent?: boolean
}

/** 本地日期 YYYY-MM-DD（「今天」以用户时区为准，不依赖服务器时区） */
export function localToday(): string {
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${mm}-${dd}`
}

/** 语音指令链路 API：plan 只读，commit 是唯一写入口（原 ai-voice 插件并入 receipts） */
export const aiVoiceApi = {
  plan: (text: string, source: 'voice' | 'text') =>
    // 在线大模型解析通常 3-15 秒，思考型模型更久；全局 30s 会误杀
    post<PlanOutcome>(
      '/receipts/voice/plan',
      { text, source, today: localToday() },
      { timeout: 120000 },
    ),

  commit: (token: string, patch: Record<string, unknown>) =>
    post<CommitResult>('/receipts/voice/commit', { token, patch, confirmed: true }, { timeout: 60000 }),

  /** 改字段后重新预演（只读）：分录、缺项、警告跟着变 */
  preview: (token: string, patch: Record<string, unknown>) =>
    post<{ action: string; args: Record<string, unknown>; preview: Preview }>(
      '/receipts/voice/preview',
      { token, patch },
      { timeout: 30000 },
    ),

  cancel: (token: string) => post<{ ok: true }>('/receipts/voice/cancel', { token }),
}
