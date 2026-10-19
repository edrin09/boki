import type { AnalysisService } from '../../reports/analysis.service'
import type { ArApService } from '../../ar-ap/ar-ap.service'
import type { BooksService } from '../../books/books.service'
import type { EmployeeSettlementService } from '../../loans/employee-settlement.service'
import type { ExpenseClaimsService } from '../../expense-claims/expense-claims.service'
import type { LoansService } from '../../loans/loans.service'
import type { ReportsService } from '../../reports/reports.service'
import { periodEndDate, periodStartDate } from '../../../common/utils/date.util'

/** Excel/卡片共用列定义：前端表格与导出的 Excel 由同一套列驱动 */
export interface IntentColumn {
  key: string
  label: string
  /** Excel 列宽（字符） */
  width?: number
  /** 金额列：Excel 中按数字写出 */
  numeric?: boolean
}

export interface IntentRange {
  startPeriod: number
  endPeriod: number
  label: string
  fiscalYear: number
}

export interface IntentCard {
  title: string
  columns: IntentColumn[]
  rows: Array<Record<string, unknown>>
  totals?: Record<string, unknown> | null
}

export interface IntentExec {
  card: IntentCard
  /** 回复模板变量（数字在模板填充时统一格式化） */
  vars: Record<string, unknown>
}

/** 语音指令执行时可用的一组服务（由 VoiceQueryService 装配） */
export interface VoiceServices {
  reportsService: ReportsService
  analysisService: AnalysisService
  booksService: BooksService
  arApService: ArApService
  loansService: LoansService
  settlementService: EmployeeSettlementService
  expenseClaimsService: ExpenseClaimsService
  /** 直连仓储/查询闭包：凭证与资金余额只读查询，避免语音模块直连太多仓储 */
  voucherRepo: {
    countAll: (
      range: IntentRange,
    ) => Promise<{ count: number; debit: number; credit: number }>
    list: (range: IntentRange, limit: number) => Promise<VoucherRow[]>
  }
  bankRepo: {
    list: () => Promise<FundBalanceRow[]>
  }
}

export interface FundBalanceRow {
  name: string
  typeLabel: string
  amount: number
}

export interface VoucherRow {
  voucherNo: string
  voucherDate: string
  summary: string
  debitTotal: number
  creditTotal: number
}

export interface IntentDef {
  id: string
  title: string
  /** 命中任一关键词即视为该意图；数组顺序即优先级，越靠前越具体 */
  keywords: string[]
  /** 是否解析时间词；false 则忽略用户给的时间 */
  timeSensitive: boolean
  /** 仅当解析期间为整年（1~12 月）时允许命中，用于「今年/全年」类汇总 */
  fullYearOnly?: boolean
  excelColumns: IntentColumn[]
  replyTpl: string
  emptyReply: string
  execute: (svc: VoiceServices, range: IntentRange) => Promise<IntentExec | null>
}

/** 凭证明细导出上限，防止 Speach 一次拖库拖爆内存 */
const VOUCHER_EXPORT_MAX = 500

function sortedByAmountDesc<T extends { amount: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.amount - a.amount)
}

// ==================== 列定义（卡片与 Excel 共用） ====================

const PL_COLUMNS: IntentColumn[] = [
  { key: 'revenue', label: '收入', numeric: true },
  { key: 'cost', label: '成本', numeric: true },
  { key: 'expense', label: '费用', numeric: true },
  { key: 'net', label: '净利润', numeric: true },
]

const AR_AP_COLUMNS: IntentColumn[] = [
  { key: 'partnerName', label: '往来单位', width: 20 },
  { key: 'amount', label: '期末余额', numeric: true },
  { key: 'directionLabel', label: '方向', width: 10 },
]

const LOAN_COLUMNS: IntentColumn[] = [
  { key: 'employeeName', label: '员工', width: 12 },
  { key: 'loanCount', label: '笔数', width: 8 },
  { key: 'amount', label: '未还金额', numeric: true },
]

const FUND_COLUMNS: IntentColumn[] = [
  { key: 'name', label: '账户', width: 20 },
  { key: 'typeLabel', label: '类型', width: 10 },
  { key: 'amount', label: '余额', numeric: true },
]

const VOUCHER_STAT_COLUMNS: IntentColumn[] = [
  { key: 'count', label: '凭证张数', width: 10 },
  { key: 'debit', label: '借方合计', numeric: true },
  { key: 'credit', label: '贷方合计', numeric: true },
]

const EXPENSE_COLUMNS: IntentColumn[] = [
  { key: 'name', label: '费用项', width: 18 },
  { key: 'amount', label: '金额', numeric: true },
  { key: 'percent', label: '占比(%)', width: 10 },
]

const EXPORT_VOUCHER_COLUMNS: IntentColumn[] = [
  { key: 'voucherNo', label: '凭证号', width: 12 },
  { key: 'voucherDate', label: '日期', width: 14 },
  { key: 'summary', label: '摘要', width: 30 },
  { key: 'debitTotal', label: '借方金额', numeric: true },
  { key: 'creditTotal', label: '贷方金额', numeric: true },
]

const EXPORT_CLAIM_COLUMNS: IntentColumn[] = [
  { key: 'claimNo', label: '报销单号', width: 16 },
  { key: 'claimDate', label: '报销日期', width: 14 },
  { key: 'employeeName', label: '报销人', width: 10 },
  { key: 'amount', label: '金额', numeric: true },
  { key: 'statusLabel', label: '状态', width: 8 },
]

const EXPORT_LOAN_COLUMNS: IntentColumn[] = [
  { key: 'loanNo', label: '借款单号', width: 16 },
  { key: 'loanDate', label: '借款日期', width: 14 },
  { key: 'employeeName', label: '借款人', width: 10 },
  { key: 'amount', label: '借款金额', numeric: true },
  { key: 'outstanding', label: '未还金额', numeric: true },
  { key: 'statusLabel', label: '状态', width: 8 },
]

/**
 * 指令集 v1。
 *
 * 目标：只读查询类意图，数字全部来自真实查询接口（利润表/往来余额/借款余额等），
 * 回复话术由模板拼接，保证「听到的数字」与页面报表一致。
 */
export const INTENTS: IntentDef[] = [
  // ==================== 导出类（关键词最具体，优先匹配） ====================
  {
    id: 'export.vouchers',
    title: '导出凭证',
    keywords: ['导出凭证', '凭证导出', '导出+凭证'],
    timeSensitive: true,
    excelColumns: [
      { key: 'voucherNo', label: '凭证号', width: 12 },
      { key: 'voucherDate', label: '日期', width: 14 },
      { key: 'summary', label: '摘要', width: 30 },
      { key: 'debitTotal', label: '借方金额', numeric: true },
      { key: 'creditTotal', label: '贷方金额', numeric: true },
    ],
    replyTpl: '{label}共有 {count} 张凭证，明细已整理好，可点击下载 Excel。',
    emptyReply: '{label}没有可导出的凭证，要不要试试其他月份？',
    async execute(svc, range) {
      const rows = await svc.voucherRepo.list(range, VOUCHER_EXPORT_MAX)
      const sum = (f: (r: VoucherRow) => number) => rows.reduce((a, r) => a + f(r), 0)
      return {
        card: {
          title: '凭证明细',
          columns: EXPORT_VOUCHER_COLUMNS,
          rows: rows as unknown as Array<Record<string, unknown>>,
          totals: {
            debitTotal: sum((r) => r.debitTotal),
            creditTotal: sum((r) => r.creditTotal),
          },
        },
        vars: {
          count: rows.length,
          debit: sum((r) => r.debitTotal),
          credit: sum((r) => r.creditTotal),
        },
      }
    },
  },
  {
    id: 'export.claims',
    title: '导出报销单',
    keywords: ['导出报销', '报销导出', '导出+报销'],
    timeSensitive: true,
    excelColumns: [
      { key: 'claimNo', label: '报销单号', width: 16 },
      { key: 'claimDate', label: '报销日期', width: 14 },
      { key: 'employeeName', label: '报销人', width: 10 },
      { key: 'amount', label: '金额', numeric: true },
      { key: 'statusLabel', label: '状态', width: 8 },
    ],
    replyTpl: '{label}共有 {count} 张报销单，合计 {total} 元，明细已整理好，可点击下载 Excel。',
    emptyReply: '{label}没有报销单，要不要试试其他月份？',
    async execute(svc, range) {
      const { list } = await svc.expenseClaimsService.findAll({
        page: 1,
        startDate: periodStartDate(range.startPeriod),
        endDate: periodEndDate(range.endPeriod),
        pageSize: VOUCHER_EXPORT_MAX,
      })
      const rows = list.map((c: any) => ({
        claimNo: c.claimNo,
        claimDate: c.claimDate,
        employeeName: c.employeeName,
        amount: Number(c.totalAmount ?? 0),
        statusLabel: c.statusLabel ?? c.status,
      }))
      return {
        card: {
          title: '报销单列表',
          columns: EXPORT_CLAIM_COLUMNS,
          rows: rows as unknown as Array<Record<string, unknown>>,
          totals: { amount: rows.reduce((a, r) => a + r.amount, 0) },
        },
        vars: {
          count: rows.length,
          total: rows.reduce((a, r) => a + r.amount, 0),
        },
      }
    },
  },
  {
    id: 'export.loans',
    title: '导出借款单',
    keywords: ['导出借款', '借款导出', '导出+借款', '导出+借支'],
    timeSensitive: true,
    excelColumns: [
      { key: 'loanNo', label: '借款单号', width: 16 },
      { key: 'loanDate', label: '借款日期', width: 14 },
      { key: 'employeeName', label: '借款人', width: 10 },
      { key: 'amount', label: '借款金额', numeric: true },
      { key: 'outstanding', label: '未还金额', numeric: true },
      { key: 'statusLabel', label: '状态', width: 8 },
    ],
    replyTpl: '{label}共有 {count} 张借款单，合计借款 {total} 元，明细已整理好，可点击下载 Excel。',
    emptyReply: '{label}没有借款单，要不要试试其他月份？',
    async execute(svc, range) {
      const { list } = await svc.loansService.findAll({
        page: 1,
        startDate: periodStartDate(range.startPeriod),
        endDate: periodEndDate(range.endPeriod),
        pageSize: VOUCHER_EXPORT_MAX,
      })
      const rows = list.map((l: any) => ({
        loanNo: l.loanNo,
        loanDate: l.loanDate,
        employeeName: l.employeeName,
        amount: Number(l.amount ?? 0),
        outstanding: Number(l.outstanding ?? 0),
        statusLabel: l.statusLabel ?? l.status,
      }))
      return {
        card: {
          title: '借款单列表',
          columns: EXPORT_LOAN_COLUMNS,
          rows: rows as unknown as Array<Record<string, unknown>>,
          totals: {
            amount: rows.reduce((a, r) => a + r.amount, 0),
            outstanding: rows.reduce((a, r) => a + r.outstanding, 0),
          },
        },
        vars: {
          count: rows.length,
          total: rows.reduce((a, r) => a + r.amount, 0),
        },
      }
    },
  },

  // ==================== 往来 / 借款 ====================
  {
    id: 'ar.summary',
    title: '应收汇总',
    keywords: ['应收', '欠我', '客户欠'],
    timeSensitive: true,
    excelColumns: AR_AP_COLUMNS,
    replyTpl:
      '到{label}，共 {count} 家往来单位有余额，合计 {total} 元。金额最大的是{name} {max} 元。明细已整理好，可点击下载 Excel。',
    emptyReply: '到{label}，没有客户欠款，应收清清爽爽。',
    async execute(svc, range) {
      const res = await svc.arApService.receivable({
        endPeriod: range.endPeriod,
        onlyWithBalance: 'true',
      })
      return arApResult(res, '应收余额', range.label)
    },
  },
  {
    id: 'ap.summary',
    title: '应付汇总',
    keywords: ['应付', '我欠', '欠供应商'],
    timeSensitive: true,
    excelColumns: AR_AP_COLUMNS,
    replyTpl:
      '到{label}，共 {count} 家往来单位有余额，合计 {total} 元。金额最大的是{name} {max} 元。明细已整理好，可点击下载 Excel。',
    emptyReply: '到{label}，没有应付余额。',
    async execute(svc, range) {
      const res = await svc.arApService.payable({
        endPeriod: range.endPeriod,
        onlyWithBalance: 'true',
      })
      return arApResult(res, '应付余额', range.label)
    },
  },
  {
    id: 'loan.balance',
    title: '员工借款',
    keywords: ['员工借', '借支', '未还借款', '借款未还', '借款'],
    timeSensitive: false,
    excelColumns: [
      { key: 'employeeName', label: '员工', width: 12 },
      { key: 'loanCount', label: '笔数', width: 8 },
      { key: 'amount', label: '未还金额', numeric: true },
    ],
    replyTpl:
      '目前有 {count} 名员工有未还借款，合计 {total} 元。最多的是{name} {max} 元。明细已整理好，可点击下载 Excel。',
    emptyReply: '目前没有员工未还借款。',
    async execute(svc) {
      const { list } = await svc.settlementService.employeeBalances({
        page: 1,
        pageSize: VOUCHER_EXPORT_MAX,
      })
      const rows = list
        .map((b: any) => ({
          employeeName: b.employeeName,
          loanCount: b.loanCount,
          amount: Math.abs(Number(b.balance ?? 0)),
        }))
        .filter((r) => r.amount > 0)
      return {
        card: {
          title: '员工未还借款',
          columns: LOAN_COLUMNS,
          rows: rows as unknown as Array<Record<string, unknown>>,
          totals: { amount: rows.reduce((a, r) => a + r.amount, 0) },
        },
        vars: {
          count: rows.length,
          total: rows.reduce((a, r) => a + r.amount, 0),
          name: rows[0]?.employeeName ?? '',
          max: rows[0]?.amount ?? 0,
        },
      }
    },
  },

  // ==================== 资金 / 凭证 ====================
  {
    id: 'fund.balance',
    title: '资金余额',
    keywords: ['余额', '账上', '还剩多少钱', '资金', '现金还有'],
    timeSensitive: false,
    excelColumns: [
      { key: 'name', label: '账户', width: 20 },
      { key: 'typeLabel', label: '类型', width: 10 },
      { key: 'amount', label: '余额', numeric: true },
    ],
    replyTpl:
      '目前共有 {count} 个资金账户，合计余额 {total} 元。金额最大的是{name} {max} 元。明细已整理好，可点击下载 Excel。',
    emptyReply: '还没有录入资金账户，可以到「资金管理」里先建一个。',
    async execute(svc, _range) {
      const rows = await svc.bankRepo.list()
      return {
        card: {
          title: '资金账户余额',
          columns: FUND_COLUMNS,
          rows: rows as unknown as Array<Record<string, unknown>>,
          totals: { amount: rows.reduce((a, r) => a + Number(r.amount), 0) },
        },
        vars: {
          count: rows.length,
          total: rows.reduce((a, r) => a + Number(r.amount), 0),
          name: rows[0]?.name ?? '',
          max: rows[0]?.amount ?? 0,
        },
      }
    },
  },
  {
    id: 'voucher.stats',
    title: '凭证统计',
    keywords: ['凭证多少', '记了几笔', '凭证数量', '几张凭证', '做了多少凭证', '凭证'],
    timeSensitive: true,
    excelColumns: [
      { key: 'count', label: '凭证张数', width: 10 },
      { key: 'debit', label: '借方合计', numeric: true },
      { key: 'credit', label: '贷方合计', numeric: true },
    ],
    replyTpl: '{label}共 {count} 张已审核凭证，借方合计 {debit} 元，贷方合计 {credit} 元，借贷两边分毫不差。',
    emptyReply: '{label}还没有审核过的凭证。',
    async execute(svc, range) {
      const { count, debit, credit } = await svc.voucherRepo.countAll(range)
      return {
        card: {
          title: '凭证统计',
          columns: VOUCHER_STAT_COLUMNS,
          rows: [{ count, debit, credit } as unknown as Record<string, unknown>],
          totals: null,
        },
        vars: { count, debit, credit },
      }
    },
  },

  // ==================== 报表类 ====================
  {
    id: 'pl.year',
    title: '年度收支',
    keywords: ['全年', '年度', '今年', '一整年'],
    timeSensitive: true,
    fullYearOnly: true,
    excelColumns: PL_COLUMNS,
    replyTpl:
      '{label}营业收入 {revenue} 元，成本 {cost} 元，费用 {expense} 元，累计净利润 {net} 元。明细已整理好，可点击下载 Excel。',
    emptyReply: '{label}没有收支记录。',
    async execute(svc, range) {
      const pl = await svc.reportsService.profitLoss({
        startPeriod: range.startPeriod,
        endPeriod: range.endPeriod,
        fiscalYear: range.fiscalYear,
      })
      const t = pl.yearToDate?.totals ?? pl.currentPeriod?.totals ?? {}
      const totals = {
        revenue: t.operatingRevenue ?? 0,
        cost: t.operatingCost ?? 0,
        expense:
          (t.sellingExpense ?? 0) +
          (t.adminExpense ?? 0) +
          (t.rdExpense ?? 0) +
          (t.financialExpense ?? 0) +
          (t.taxAndSurcharge ?? 0),
        net: t.netProfit ?? 0,
      }
      const empty =
        totals.revenue === 0 && totals.cost === 0 && totals.expense === 0 && totals.net === 0
      if (empty) return null
      return {
        card: {
          title: `${range.label}收支汇总`,
          columns: PL_COLUMNS,
          rows: [totals as unknown as Record<string, unknown>],
          totals,
        },
        vars: totals,
      }
    },
  },
  {
    id: 'pl.period',
    title: '期间收支',
    keywords: ['收支', '收入支出', '盈亏', '赚', '利润', '营收', '获利'],
    timeSensitive: true,
    excelColumns: PL_COLUMNS,
    replyTpl:
      '{label}营业收入 {revenue} 元，成本 {cost} 元，费用 {expense} 元，净利润 {net} 元。明细已整理好，可点击下载 Excel。',
    emptyReply: '{label}没有收支记录，要不要试试其他月份？',
    async execute(svc, range) {
      const pl = await svc.reportsService.profitLoss({
        startPeriod: range.startPeriod,
        endPeriod: range.endPeriod,
        fiscalYear: range.fiscalYear,
      })
      const t = pl.currentPeriod?.totals ?? {}
      const totals = {
        revenue: t.operatingRevenue ?? 0,
        cost: t.operatingCost ?? 0,
        expense:
          (t.sellingExpense ?? 0) +
          (t.adminExpense ?? 0) +
          (t.rdExpense ?? 0) +
          (t.financialExpense ?? 0) +
          (t.taxAndSurcharge ?? 0),
        net: t.netProfit ?? 0,
      }
      const empty =
        totals.revenue === 0 && totals.cost === 0 && totals.expense === 0 && totals.net === 0
      if (empty) return null
      return {
        card: {
          title: `${range.label}收支汇总`,
          columns: PL_COLUMNS,
          rows: [totals as unknown as Record<string, unknown>],
          totals,
        },
        vars: totals,
      }
    },
  },
  {
    id: 'expense.structure',
    title: '费用结构',
    keywords: ['费用', '花在哪', '花销', '开支', '支出'],
    timeSensitive: true,
    excelColumns: [
      { key: 'name', label: '费用项', width: 18 },
      { key: 'amount', label: '金额', numeric: true },
      { key: 'percent', label: '占比(%)', width: 10 },
    ],
    replyTpl:
      '{label}费用合计 {total} 元，占比最高的是{name} {max} 元（{percent}%）。明细已整理好，可点击下载 Excel。',
    emptyReply: '{label}没有费用发生，要不要试试其他月份？',
    async execute(svc, range) {
      const res = await svc.analysisService.expenseAnalysis({
        startPeriod: range.startPeriod,
        endPeriod: range.endPeriod,
      })
      const rows = sortedByAmountDesc(
        (res.byAccount as any[]).map((g) => ({
          name: g.name,
          amount: Number(g.amount ?? 0),
          percent: Number(g.percent ?? 0),
        })),
      )
      return {
        card: {
          title: `${range.label}费用结构`,
          columns: EXPENSE_COLUMNS,
          rows: rows as unknown as Array<Record<string, unknown>>,
          totals: { amount: Number(res.total ?? 0) },
        },
        vars: {
          total: Number(res.total ?? 0),
          name: rows[0]?.name ?? '',
          max: rows[0]?.amount ?? 0,
          percent: rows[0]?.percent ?? 0,
        },
      }
    },
  },
]

/** 应收/应付结果 → 卡片 */
function arApResult(res: any, title: string, label: string): IntentExec | null {
  const rows = (res.rows as any[]).map((r) => ({
    partnerName: r.partnerName ?? '未指定往来单位',
    amount: Math.abs(Number(r.closingBalance ?? 0)),
    directionLabel: r.direction === 'debit' ? '借（对方欠款）' : '贷（我方欠款）',
  }))
  const total = rows.reduce((a, r) => a + r.amount, 0)
  if (rows.length === 0) return null
  return {
    card: {
      title,
      columns: AR_AP_COLUMNS,
      rows: rows as unknown as Array<Record<string, unknown>>,
      totals: { amount: total },
    },
    vars: {
      count: rows.length,
      total,
      name: rows[0]?.partnerName ?? '',
      max: rows[0]?.amount ?? 0,
      label,
    },
  }
}

