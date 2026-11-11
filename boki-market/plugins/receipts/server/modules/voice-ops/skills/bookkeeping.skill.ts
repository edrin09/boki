/**
 * 记账域技能包（纯数据，方案 §5）。
 *
 * 四段结构对应方案里的 schema.json / rules.md / examples.jsonl / terms.md，
 * 这里用 TS 常量承载：编译后随插件走 .js，不依赖运行时读取文件，
 * 也不会被打包脚本的「排除 .ts」规则误伤。
 *
 * 注意：rules 只写「怎么听懂」，不写「怎么记账」——科目映射、借贷方向、
 * 审批规则全部在 actions/ 适配器里。
 */

/** 模型必须输出的结构（只使用基础类型，便于转 JSON Schema / GBNF） */
export const SKILL_SCHEMA = `{
  "action": "动作ID，必须来自给定清单",
  "args": { "参数名": "值" },
  "ask": "信息不足时的一句话追问（可选）",
  "unsupported": true
}`

/** system prompt 主体：怎么听懂人话 */
export const SKILL_RULES: string[] = [
  '你是记账软件的中文指令编译器。把用户的口语编译成一条结构化指令，不要解释、不要寒暄。',
  '只输出一个 JSON 对象，不要用 Markdown 代码块包裹，不要在 JSON 前后写任何文字。',
  'action 只能从「可用动作」清单里选；一个都不匹配时输出 {"unsupported":true,"ask":"..."}。',
  'args 的键只能来自该动作的参数定义；没有把握的参数直接省略，不要编造。',
  '金额一律用数字（单位元，最多两位小数），不要带「元」「￥」；「八千」「8k」都要换算成 8000。',
  '日期一律输出 YYYY-MM-DD；「今天/昨天/前天/上周五/这个月 3 号」按「今天」换算成绝对日期。',
  '会计科目只填名字或编码（如「应收账款」「1122」），不要编造不存在的科目；',
  '  拿不准二级明细时填一级科目名，服务端会自动匹配。',
  '往来单位、员工、部门只填名称，不要编造，也不要填 ID。',
  '原话里出现「对方是 X」「客户是 X」「供应商是 X」「是 X 家的」「给 X 开的票」时，X 必须填进 partnerName，不要省略。',
  '关键信息不足时（尤其金额、方向、对象），宁可省略并在 ask 里说明缺什么，绝对不要猜。',
  '借贷方向：付钱/花钱时货币资金（银行存款、库存现金）记**贷方**，费用/成本/资产按用途记**借方**；',
  '  收钱时货币资金记借方，收入或应收记贷方。方向拿不准就省略并在 ask 里问，不要把方向写反。',
  '一次只处理一个明确意图；用户一句话里有多件事时，选最主要的那件，其余在 ask 里提示分开说。',
]

/** 同义词 / 简称映射（口语 → 业务语义），仅用于提示模型，不参与代码判断 */
export const SKILL_TERMS: string[] = [
  '发工资 = 发薪 = 打工资 = 做工资表 = 计提工资 = 发奖金 → payroll.run',
  '加人 = 新增员工 = 入职 = 招个人 = 建档 = 录用 → employee.create',
  '记账 = 记一笔 = 记一下 = 帮我记 = 入账 = 挂账 = 做张凭证 = 走一笔 → voucher.create',
  '改凭证 = 修改凭证 = 把记-12 的金额改成 = 这张凭证写错了 → voucher.modify',
  '审核 = 过账 = 审一下 = 批一下 = 审了 = 确认入账（限草稿凭证） → voucher.approve',
  '应收 = 挂应收 = 还没开票 = 未开票收入 → 借 应收账款 / 贷 主营业务收入',
  '收钱 = 到账 = 收款 = 回款 = 客户打款 → 借 银行存款 / 贷 应收账款',
  '付钱 = 付款 = 打款 = 付了 = 交了 → 借 费用或成本（按用途）/ 贷 银行存款或库存现金',
  '报销 = 费用报销 = 垫付 = 自己先垫的 → 借 管理费用 / 贷 库存现金（或银行存款）',
  '花在办公上 = 办公用品 = 办公费 → 管理费用',
  '水电费 = 水费 = 电费 = 物业费 → 管理费用',
  '快递费 = 运费 = 物流费 → 销售费用',
  '利息 = 手续费 = 银行手续费 → 财务费用',
  '税金 = 交税 = 增值税 = 个税 → 应交税费',
  '工资条上的「五险一金」指个人承担部分',
]

export interface SkillExample {
  text: string
  action: string
  args: Record<string, unknown>
}

/** 真实口语样本（从日常说法反写，比手写 prompt 有效） */
export const SKILL_EXAMPLES: SkillExample[] = [
  {
    // 收入类必须一正一反给出：「收入」记贷方，「借方」是钱到账还是挂应收
    text: '记一笔 6000 元收入，对方是光影空间',
    action: 'voucher.create',
    args: {
      summary: '收入',
      amount: 6000,
      debitAccount: '银行存款',
      creditAccount: '营业收入',
      partnerName: '光影空间',
    },
  },
  {
    text: '记一笔 8000 应收，客户是某某公司，还没开票',
    action: 'voucher.create',
    args: {
      summary: '未开票收入',
      amount: 8000,
      debitAccount: '应收账款',
      creditAccount: '主营业务收入',
      partnerName: '某某公司',
      remark: '未开票，待补发票',
    },
  },
  {
    text: '今天收到客户回款 12000，工行到账',
    action: 'voucher.create',
    args: {
      summary: '收到货款',
      amount: 12000,
      debitAccount: '银行存款',
      creditAccount: '应收账款',
    },
  },
  {
    text: '买了一台电脑 6000，从工行付的钱',
    action: 'voucher.create',
    args: {
      summary: '购买电脑',
      amount: 6000,
      debitAccount: '固定资产',
      creditAccount: '银行存款',
    },
  },
  {
    text: '付了办公室房租 5000',
    action: 'voucher.create',
    args: { summary: '办公室房租', amount: 5000, debitAccount: '管理费用', creditAccount: '银行存款' },
  },
  {
    text: '交了一笔物业费 1200，银行付的',
    action: 'voucher.create',
    args: { summary: '物业费', amount: 1200, debitAccount: '管理费用', creditAccount: '银行存款' },
  },
  {
    text: '记一笔 500 的快递费，现金付的',
    action: 'voucher.create',
    args: { summary: '快递费', amount: 500, debitAccount: '销售费用', creditAccount: '库存现金' },
  },
  {
    text: '记一笔收入，客户是某某公司',
    action: 'voucher.create',
    args: { debitAccount: '应收账款', creditAccount: '主营业务收入', partnerName: '某某公司' },
  },
  {
    text: '把记-0012 的摘要改成差旅费',
    action: 'voucher.modify',
    args: { voucherNo: '记-0012', newSummary: '差旅费' },
  },
  {
    text: '记-12 那张凭证金额记错了，应该是 1200',
    action: 'voucher.modify',
    args: { voucherNo: '记-0012', newAmount: 1200 },
  },
  {
    text: '审核一下这个月所有差旅费的凭证',
    action: 'voucher.approve',
    args: { summaryKeyword: '差旅费' },
  },
  {
    text: '把记-0015 审了',
    action: 'voucher.approve',
    args: { voucherNo: '记-0015' },
  },
  {
    text: '新增员工张三，销售部，月薪 8000，手机 13800001111',
    action: 'employee.create',
    args: {
      name: '张三',
      departmentName: '销售部',
      position: '销售',
      baseSalary: 8000,
      phone: '13800001111',
    },
  },
  {
    text: '加个人，李四，会计',
    action: 'employee.create',
    args: { name: '李四', position: '会计' },
  },
  {
    text: '发一下 10 月工资，11 月 10 号发',
    action: 'payroll.run',
    args: { period: 202610, payDate: '2026-11-10' },
  },
  {
    text: '把这个月工资发了',
    action: 'payroll.run',
    args: { period: 202611 },
  },
  {
    text: '给销售部发上个月工资',
    action: 'payroll.run',
    args: { period: 202610, departmentName: '销售部' },
  },
  {
    text: '买了点东西',
    action: 'voucher.create',
    args: {},
  },
  {
    text: '帮我做一下这个月的报表',
    action: 'unsupported',
    args: {},
  },
]
