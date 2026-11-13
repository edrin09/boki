/**
 * 凭证备注统一生成器。
 *
 * 凭证列表的「备注/补充信息」要能脱离凭证分录独立看懂一笔业务，
 * 因此统一格式为：业务动作：业务对象 金额（单据号、银行流水等追溯信息）。
 * 例如：
 *   销售开票：杭州势然网络科技有限公司 2406.40（发票 2026年11月12日_销售_2406.40.pdf）
 *   收到货款：杭州势然网络科技有限公司 601.60（银行流水 66764659）
 *   报销：张亚飞 21.95（北京京东世纪信息技术有限公司 采购费用，报销单 BX20260006，冲减借款）
 *   工资计提：2026 年 10 月工资 6000.00（工资单 GZ20261002）
 *
 * 所有由导入、AI 智能记账、业务单据自动生成的凭证都应走这里，避免各插件
 * 各写一套「票据自动生成」「报销单 XXX」这类看不出业务含义的文案。
 */
export interface VoucherRemarkInput {
  /** 业务动作：销售开票、采购入账、收到货款、支付货款、报销、借款、工资计提等 */
  action: string
  /** 业务对象：往来单位、员工、工资期间等 */
  subject?: string | null
  /** 金额（元），0 或空不展示 */
  amount?: number | null
  /** 追溯信息：单据编号、发票文件名、银行流水、补充说明等，按顺序放入括号 */
  refs?: Array<string | null | undefined>
}

/** 备注最大长度，与凭证实体字段保持一致 */
const MAX_REMARK_LENGTH = 200

export function buildVoucherRemark(input: VoucherRemarkInput): string {
  const action = (input.action ?? '').trim()
  const subject = (input.subject ?? '').trim()
  const cents = typeof input.amount === 'number' ? Math.round(input.amount * 100) : 0
  const amount = cents !== 0 ? ` ${(cents / 100).toFixed(2)}` : ''
  const refs = (input.refs ?? [])
    .map((r) => (r ?? '').trim())
    .filter((r) => r.length > 0)

  const head = subject ? `${action}：${subject}` : action
  const text = refs.length ? `${head}${amount}（${refs.join('，')}）` : `${head}${amount}`
  return text.slice(0, MAX_REMARK_LENGTH)
}
