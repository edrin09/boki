import type { PreviewField, PreviewLine, PreviewMissing } from '../bridge/protocol'

/** 高风险金额阈值：超过则在卡片上提示二次确认（方案 §8 高金额动作） */
export const HIGH_AMOUNT = 50000

export function todayString(): string {
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${mm}-${dd}`
}

/** 金额展示：千分位 + 两位小数（仅用于卡片文案） */
export function money(value: unknown): string {
  const num = Number(value ?? 0)
  return Number.isFinite(num)
    ? num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00'
}

/** 金额两位小数（服务端权威值） */
export function round2(value: unknown): number {
  return Math.round(Number(value ?? 0) * 100) / 100
}

export function text(value: unknown): string {
  return String(value ?? '').trim()
}

/**
 * 「全部 / 不限 / 空」都表示不按部门筛选，不是真实部门名。
 *
 * 卡片上「部门」留空就是全部部门，但下拉清空后、或模型照抄占位文案时
 * 会回传「全部」两个字。这种值绝不能拿去查档案，否则报「部门『全部』不存在」。
 */
const DEPT_ANY = /^(全部|不限|所有|全部部门|所有部门|全部人员|任意|ALL|all)$/

export function normalizeDept(value: unknown): string {
  const name = text(value)
  return DEPT_ANY.test(name) ? '' : name
}

export function flag(list: PreviewMissing[], field: string, label: string, type?: PreviewMissing['type']) {
  if (list.some((item) => item.field === field)) return
  list.push({ field, label, type })
}

/**
 * 构造预览字段。
 * meta 只承载「怎么填」（控件类型 / 推荐候选 / 占位文案），
 * key、label、value、editable 由这里统一收口，避免适配器写错。
 */
export function field(
  key: string,
  label: string,
  value: unknown,
  editable = true,
  meta?: Pick<PreviewField, 'kind' | 'options' | 'placeholder' | 'emptyLabel'>,
): PreviewField {
  const item: PreviewField = {
    key,
    label,
    value: value === null || value === undefined ? '' : String(value),
    editable,
  }
  if (meta?.kind) item.kind = meta.kind
  if (meta?.options?.length) item.options = meta.options
  if (meta?.placeholder) item.placeholder = meta.placeholder
  if (meta?.emptyLabel) item.emptyLabel = meta.emptyLabel
  return item
}

/** 分录行：金额为 0 的一侧不显示，与凭证页口径一致 */
export function line(account: string, debit: number, credit: number, aux?: string): PreviewLine {
  return { account, debit: round2(debit), credit: round2(credit), aux: aux || undefined }
}

/** 校验借贷是否平衡（以分为单位比较，避免浮点误差） */
export function balanced(lines: PreviewLine[]): boolean {
  const debit = lines.reduce((sum, item) => sum + Math.round(item.debit * 100), 0)
  const credit = lines.reduce((sum, item) => sum + Math.round(item.credit * 100), 0)
  return debit === credit && debit > 0
}
