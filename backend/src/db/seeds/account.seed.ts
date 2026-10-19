import { AccountCategory, AuxiliaryType, BalanceDirection } from '../../common/enums'

export interface SeedAccountNode {
  code: string
  name: string
  direction: BalanceDirection
  auxiliaryTypes?: AuxiliaryType[]
  isCash?: boolean
  isBank?: boolean
  sort?: number
  children?: SeedAccountNode[]
}

const D = BalanceDirection.DEBIT
const C = BalanceDirection.CREDIT

/**
 * 会计科目种子（企业会计准则常用科目）
 * 编码规则：1xxx 资产 / 2xxx 负债 / 3xxx 所有者权益 / 4xxx 成本 / 6xxx 损益
 */
export const ACCOUNT_SEED: SeedAccountNode[] = [
  // ==================== 资产 ====================
  {
    code: '1001',
    name: '库存现金',
    direction: D,
    isCash: true,
    sort: 1,
  },
  {
    code: '1002',
    name: '银行存款',
    direction: D,
    isBank: true,
    sort: 2,
  },
  { code: '1012', name: '其他货币资金', direction: D, sort: 3 },
  { code: '1101', name: '交易性金融资产', direction: D, sort: 10 },
  { code: '1121', name: '应收票据', direction: D, auxiliaryTypes: [AuxiliaryType.PARTNER], sort: 11 },
  { code: '1122', name: '应收账款', direction: D, auxiliaryTypes: [AuxiliaryType.PARTNER], sort: 12 },
  { code: '1123', name: '预付账款', direction: D, auxiliaryTypes: [AuxiliaryType.PARTNER], sort: 13 },
  { code: '1131', name: '应收股利', direction: D, auxiliaryTypes: [AuxiliaryType.PARTNER], sort: 14 },
  { code: '1132', name: '应收利息', direction: D, auxiliaryTypes: [AuxiliaryType.PARTNER], sort: 15 },
  {
    // 员工垫付/借款等场景对手方是员工，挂「员工」辅助核算以便按员工拆分往来余额
    // （不强制「往来单位」辅助核算：对手方不是往来单位）
    code: '1221',
    name: '其他应收款',
    direction: D,
    auxiliaryTypes: [AuxiliaryType.EMPLOYEE],
    sort: 20,
  },
  { code: '1231', name: '坏账准备', direction: C, sort: 21 },
  { code: '1401', name: '材料采购', direction: D, sort: 30 },
  { code: '1402', name: '在途物资', direction: D, sort: 31 },
  { code: '1403', name: '原材料', direction: D, auxiliaryTypes: [AuxiliaryType.PROJECT], sort: 32 },
  { code: '1404', name: '材料成本差异', direction: D, sort: 33 },
  { code: '1405', name: '库存商品', direction: D, sort: 34 },
  { code: '1407', name: '商品进销差价', direction: C, sort: 35 },
  { code: '1408', name: '委托代销商品', direction: D, sort: 36 },
  { code: '1411', name: '委托加工物资', direction: D, sort: 37 },
  {
    code: '1421',
    name: '在建工程',
    direction: D,
    auxiliaryTypes: [AuxiliaryType.PROJECT],
    sort: 38,
  },
  {
    code: '1601',
    name: '固定资产',
    direction: D,
    auxiliaryTypes: [AuxiliaryType.DEPARTMENT],
    sort: 40,
  },
  { code: '1602', name: '累计折旧', direction: C, sort: 41 },
  { code: '1606', name: '固定资产清理', direction: D, sort: 42 },
  { code: '1701', name: '无形资产', direction: D, sort: 43 },
  { code: '1702', name: '累计摊销', direction: C, sort: 44 },
  { code: '1801', name: '长期待摊费用', direction: D, sort: 45 },

  // ==================== 负债 ====================
  { code: '2001', name: '短期借款', direction: C, sort: 1 },
  { code: '2201', name: '应付票据', direction: C, auxiliaryTypes: [AuxiliaryType.PARTNER], sort: 10 },
  { code: '2202', name: '应付账款', direction: C, auxiliaryTypes: [AuxiliaryType.PARTNER], sort: 11 },
  { code: '2203', name: '预收账款', direction: C, auxiliaryTypes: [AuxiliaryType.PARTNER], sort: 12 },
  {
    code: '2211',
    name: '应付职工薪酬',
    direction: C,
    sort: 13,
    children: [
      { code: '2211.01', name: '工资', direction: D, sort: 1 },
      { code: '2211.02', name: '社会保险费', direction: D, sort: 2 },
      { code: '2211.03', name: '住房公积金', direction: D, sort: 3 },
    ],
  },
  {
    code: '2221',
    name: '应交税费',
    direction: C,
    sort: 14,
    children: [
      { code: '2221.01', name: '应交增值税', direction: D, sort: 1 },
      { code: '2221.02', name: '未交增值税', direction: D, sort: 2 },
      { code: '2221.03', name: '应交企业所得税', direction: D, sort: 3 },
      { code: '2221.04', name: '应交个人所得税', direction: D, sort: 4 },
      { code: '2221.05', name: '应交城市维护建设税', direction: D, sort: 5 },
      { code: '2221.06', name: '应交教育费附加', direction: D, sort: 6 },
    ],
  },
  { code: '2231', name: '应付利息', direction: C, sort: 15 },
  { code: '2232', name: '应付利润', direction: C, sort: 16 },
  {
    // 不强制「往来单位」辅助核算：工资代扣社保/公积金等挂账场景对手方不是往来单位
    code: '2241',
    name: '其他应付款',
    direction: C,
    sort: 17,
  },
  { code: '2401', name: '递延收益', direction: C, sort: 20 },
  { code: '2701', name: '长期借款', direction: C, sort: 30 },
  { code: '2711', name: '长期应付款', direction: C, sort: 31 },

  // ==================== 所有者权益 ====================
  { code: '3001', name: '实收资本', direction: C, sort: 1 },
  { code: '3002', name: '资本公积', direction: C, sort: 2 },
  {
    code: '3101',
    name: '盈余公积',
    direction: C,
    sort: 3,
    children: [
      { code: '3101.01', name: '法定盈余公积', direction: C, sort: 1 },
      { code: '3101.02', name: '任意盈余公积', direction: C, sort: 2 },
    ],
  },
  { code: '3102', name: '本年利润', direction: C, sort: 4 },
  {
    code: '3103',
    name: '利润分配',
    direction: C,
    sort: 5,
    children: [
      { code: '3103.01', name: '未分配利润', direction: C, sort: 1 },
    ],
  },

  // ==================== 成本 ====================
  {
    code: '4001',
    name: '生产成本',
    direction: D,
    auxiliaryTypes: [AuxiliaryType.PROJECT],
    sort: 1,
    children: [
      { code: '4001.01', name: '直接材料', direction: D, sort: 1 },
      { code: '4001.02', name: '直接人工', direction: D, sort: 2 },
      { code: '4001.03', name: '制造费用', direction: D, sort: 3 },
    ],
  },
  {
    code: '4101',
    name: '制造费用',
    direction: D,
    auxiliaryTypes: [AuxiliaryType.DEPARTMENT],
    sort: 10,
  },

  // ==================== 损益 ====================
  {
    code: '6001',
    name: '营业收入',
    direction: C,
    auxiliaryTypes: [AuxiliaryType.PARTNER],
    sort: 1,
  },
  {
    code: '6051',
    name: '其他业务收入',
    direction: C,
    auxiliaryTypes: [AuxiliaryType.PARTNER],
    sort: 2,
  },
  { code: '6111', name: '投资收益', direction: C, sort: 3 },
  { code: '6201', name: '营业外收入', direction: C, sort: 4 },
  { code: '6301', name: '税金及附加', direction: D, sort: 5 },
  { code: '6401', name: '营业成本', direction: D, sort: 6 },
  {
    code: '6601',
    name: '销售费用',
    direction: D,
    auxiliaryTypes: [AuxiliaryType.DEPARTMENT],
    sort: 7,
  },
  {
    // 管理费用为公司通用费用，不强制按部门辅助核算：
    // 报销单/工资表等单据生成凭证时未必能确定部门，避免阻塞业务流程
    code: '6602',
    name: '管理费用',
    direction: D,
    sort: 8,
  },
  {
    code: '6603',
    name: '研发费用',
    direction: D,
    auxiliaryTypes: [AuxiliaryType.DEPARTMENT],
    sort: 9,
  },
  {
    code: '6701',
    name: '财务费用',
    direction: D,
    sort: 10,
    children: [
      { code: '6701.01', name: '利息支出', direction: D, sort: 1 },
      { code: '6701.02', name: '利息收入', direction: C, sort: 2 },
      { code: '6701.03', name: '手续费', direction: D, sort: 3 },
    ],
  },
  { code: '6801', name: '营业外支出', direction: D, sort: 11 },
  { code: '6901', name: '所得税费用', direction: D, sort: 12 },
]

/** 科目类别中文名（用于 fullName 与报表分组） */
export const CATEGORY_LABELS: Record<string, string> = {
  [AccountCategory.ASSET]: '资产',
  [AccountCategory.LIABILITY]: '负债',
  [AccountCategory.EQUITY]: '所有者权益',
  [AccountCategory.COST]: '成本',
  [AccountCategory.PROFIT]: '损益',
}

/**
 * 根据科目编码推断类别
 */
export function inferCategory(code: string): AccountCategory {
  const head = parseInt(code.slice(0, 1), 10)
  switch (head) {
    case 1:
      return AccountCategory.ASSET
    case 2:
      return AccountCategory.LIABILITY
    case 3:
      return AccountCategory.EQUITY
    case 4:
      return AccountCategory.COST
    case 6:
      return AccountCategory.PROFIT
    default:
      return AccountCategory.ASSET
  }
}

/** 金额方向判断辅助：资产/成本为借方，负债/权益/损益按种子定义 */
export function isDebitNormal(category: AccountCategory): boolean {
  return category === AccountCategory.ASSET || category === AccountCategory.COST
}