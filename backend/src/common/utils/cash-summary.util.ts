/**
 * 收付款摘要生成：把银行流水的机器原文（汇款汇入 / 转入 / 网上汇款…）
 * 换成有业务含义的摘要，例如「收到杭州势然网络科技有限公司 预收款」。
 *
 * 原则：
 * 1. 用户显式填写的摘要永远优先，本工具只兜底；
 * 2. 兜底也要能看出「谁 + 什么钱」，不允许把银行原文直接写进凭证；
 * 3. 项目 / 阶段（预付款、进度款、尾款）属于业务判断，交给用户补，不臆测。
 */

/** 银行流水原文里的空壳摘要，不能作为凭证摘要直接入账 */
const GENERIC_WORDS = [
  '汇款汇入',
  '汇款收入',
  '汇入收入',
  '汇入',
  '转入',
  '转出',
  '转账',
  '网上汇款',
  '网银转账',
  '银行流水',
  '存款利息',
  '利息',
  '手续费',
  '往来款',
  '退汇',
  '收款',
  '付款',
]

/** 判断摘要是否只是银行给的机器原文（或为空） */
export function isGenericSummary(summary?: string | null): boolean {
  const v = (summary ?? '').trim()
  if (!v) return true
  return GENERIC_WORDS.some((w) => v === w || v.startsWith(w))
}

/** 对方科目 → 款项性质；命中不了的用科目名本身 */
const KIND_BY_CODE: Array<[RegExp, string]> = [
  [/^1122/, '货款'],
  [/^1123/, '预付款'],
  [/^2203/, '预收款'],
  [/^1221/, '备用金'],
  [/^2211/, '工资'],
  [/^2221/, '税款'],
  [/^2241/, '往来款'],
  [/^4001/, '投资款'],
  [/^6001/, '收入'],
  [/^6051/, '收入'],
  [/^5001/, '成本'],
]

export interface CashSummaryParts {
  /** receipt / payment / expense / income / transfer */
  bizType: string
  /** 往来单位名称，优先于对方户名 */
  partnerName?: string | null
  /** 员工姓名（员工往来时） */
  employeeName?: string | null
  /** 对方科目编码，用来判断款项性质 */
  counterAccountCode?: string | null
  /** 对方科目名称，编码判断不出时直接用 */
  counterAccountName?: string | null
  /** 银行流水原文，仅作最后兜底与利息/手续费等识别 */
  rawSummary?: string | null
}

const ACTION_BY_TYPE: Record<string, string> = {
  receipt: '收到',
  income: '收到',
  payment: '支付',
  expense: '支付',
}

function kindOf(parts: CashSummaryParts): string {
  const code = (parts.counterAccountCode ?? '').trim()
  if (code) {
    for (const [re, kind] of KIND_BY_CODE) {
      if (re.test(code)) return kind
    }
  }
  const name = (parts.counterAccountName ?? '').trim()
  if (!name) return ''
  // 「管理费用-办公费」这类明细科目，只取一级名称，避免摘要过长
  return name.split(/[-－/]/)[0].trim()
}

/**
 * 生成业务摘要。示例：
 *  - 收款 + 往来单位 + 1122 → 收到杭州势然网络科技有限公司 货款
 *  - 付款 + 往来单位 + 2203 → 支付光影空间（广州）视觉科技有限公司 预收款
 *  - 收利息（无对方） → 收到利息收入
 */
export function composeCashSummary(parts: CashSummaryParts): string {
  const action = ACTION_BY_TYPE[parts.bizType] ?? '支付'
  const raw = (parts.rawSummary ?? '').trim()

  if (parts.bizType === 'transfer') return '内部转账'

  const who = (parts.partnerName ?? '').trim() || (parts.employeeName ?? '').trim()
  let kind = kindOf(parts)

  // 没有对方科目时，从银行原文里捞一点信息，至少别丢「利息 / 手续费」
  if (!kind && raw) {
    if (/利息/.test(raw)) kind = '利息收入'
    else if (/手续费/.test(raw)) kind = '手续费'
  }

  let text: string
  if (who && kind) text = `${action}${who} ${kind}`
  else if (who) text = `${action}${who}款`
  else if (kind) text = `${action}${kind}`
  else text = isGenericSummary(raw) ? `${action}款项` : raw

  return text.slice(0, 180)
}
