import { BadRequestException, Injectable } from '@nestjs/common'
import { In } from 'typeorm'
import { CompanyScopedRepository } from '../../common/company/company.repository'
import { InjectCompanyRepo } from '../../common/company/company-repo.decorator'
import { Account } from '../../entities/account.entity'
import { Voucher } from '../../entities/voucher.entity'
import { VoucherEntry } from '../../entities/voucher-entry.entity'
import { Receipt } from '../../entities/receipt.entity'
import { Partner } from '../../entities/partner.entity'
import { Payroll, ExpenseClaim } from '../../entities/hr.entity'
import { BalanceDirection, ReceiptStatus, VoucherStatus } from '../../common/enums'
import { toCents, fromCents } from '../../common/utils/money.util'
import {
  addPeriod,
  currentPeriod,
  periodEndDate,
  periodStartDate,
  periodToRange,
  periodToYear,
} from '../../common/utils/date.util'
import { BooksService } from '../books/books.service'
import { ReportsService } from './reports.service'
import type { ReportQueryDto } from './dto/report.dto'

/** 现金流量三大分类 */
type CashCategoryKey = 'operating' | 'investing' | 'financing'

/** 现金流分类规则：按对方科目编码前缀/整段匹配（自上而下优先） */
const INVESTING_PREFIXES = ['1511', '1601', '1604', '1701', '1501', '1101', '1521', '1512', '1602', '1603']
const FINANCING_CODES = ['2001', '2501', '4001', '4002', '4101', '2232', '2231']

/** 费用分析涉及的损益类费用科目一级编码 */
const EXPENSE_CODES = ['6401', '6301', '6601', '6602', '6603', '6701', '6801']

interface CategoryAgg {
  key: CashCategoryKey
  title: string
  inflow: number
  outflow: number
}

const emptyCategory = (key: CashCategoryKey, title: string): CategoryAgg => ({
  key,
  title,
  inflow: 0,
  outflow: 0,
})

@Injectable()
export class AnalysisService {
  constructor(
    @InjectCompanyRepo(Account) private readonly accountRepo: CompanyScopedRepository<Account>,
    @InjectCompanyRepo(Voucher) private readonly voucherRepo: CompanyScopedRepository<Voucher>,
    @InjectCompanyRepo(VoucherEntry) private readonly entryRepo: CompanyScopedRepository<VoucherEntry>,
    @InjectCompanyRepo(Receipt) private readonly receiptRepo: CompanyScopedRepository<Receipt>,
    @InjectCompanyRepo(Partner) private readonly partnerRepo: CompanyScopedRepository<Partner>,
    @InjectCompanyRepo(Payroll) private readonly payrollRepo: CompanyScopedRepository<Payroll>,
    @InjectCompanyRepo(ExpenseClaim)
    private readonly expenseClaimRepo: CompanyScopedRepository<ExpenseClaim>,
    private readonly booksService: BooksService,
    private readonly reportsService: ReportsService,
  ) {}

  // ==================== P18.1 票据台账 ====================

  async receiptLedger(query: ReportQueryDto): Promise<any> {
    const endPeriod = query.endPeriod ?? currentPeriod()
    const startPeriod = query.startPeriod ?? endPeriod
    if (startPeriod > endPeriod) {
      return this.throwPeriodError()
    }
    const { startDate, endDate } = periodToRange(startPeriod)
    const endOfEnd = periodEndDate(endPeriod)
    const startOfStart = periodStartDate(startPeriod)

    const qb = this.receiptRepo
      .createQueryBuilder('r')
      .where('r.status NOT IN (:...excluded)', {
        excluded: [ReceiptStatus.DUPLICATE, ReceiptStatus.FAILED],
      })
      .andWhere('(r.issueDate IS NULL OR r.issueDate >= :startDate)', { startDate: startOfStart })
      .andWhere('r.issueDate <= :endDate', { endDate: endOfEnd })

    if (query.receiptType) {
      qb.andWhere('r.receiptType = :receiptType', { receiptType: query.receiptType })
    }
    if (query.keyword) {
      qb.andWhere('(r.fileName LIKE :kw OR r.sellerName LIKE :kw OR r.buyerName LIKE :kw)', {
        kw: `%${query.keyword}%`,
      })
    }

    const rows = await qb.orderBy('r.issueDate', 'ASC').addOrderBy('r.createdAt', 'ASC').getMany()

    /** 按票据类型分组汇总 */
    const byType = new Map<string, { type: string; typeName: string; count: number; amount: number; taxAmount: number }>()
    let amount = 0
    let taxAmount = 0
    for (const r of rows) {
      const key = r.receiptType || 'unknown'
      const g = byType.get(key) ?? {
        type: key,
        typeName: r.receiptTypeName || '未识别',
        count: 0,
        amount: 0,
        taxAmount: 0,
      }
      g.count += 1
      g.amount = fromCents(toCents(g.amount) + toCents(r.amount ?? 0))
      g.taxAmount = fromCents(toCents(g.taxAmount) + toCents(r.taxAmount ?? 0))
      byType.set(key, g)
      amount = fromCents(toCents(amount) + toCents(r.amount ?? 0))
      taxAmount = fromCents(toCents(taxAmount) + toCents(r.taxAmount ?? 0))
    }

    return {
      title: '票据台账',
      period: { startPeriod, endPeriod },
      startDate: startOfStart,
      endDate: endOfEnd,
      summary: {
        count: rows.length,
        amount,
        taxAmount,
        byType: Array.from(byType.values()).sort((a, b) => b.amount - a.amount),
      },
      rows: rows.map((r) => ({
        id: r.id,
        fileName: r.fileName,
        receiptType: r.receiptType,
        receiptTypeName: r.receiptTypeName,
        issueDate: r.issueDate,
        amount: r.amount,
        taxAmount: r.taxAmount,
        invoiceNo: r.invoiceNo,
        sellerName: r.sellerName,
        buyerName: r.buyerName,
        status: r.status,
        statusLabel: this.receiptStatusLabel(r.status),
        voucherId: r.voucherId,
        confirmedAt: r.confirmedAt,
        rejectedAt: r.rejectedAt,
      })),
    }
  }

  // ==================== P18.2 现金流量简表 ====================

  async cashFlow(query: ReportQueryDto): Promise<any> {
    const endPeriod = query.endPeriod ?? currentPeriod()
    const startPeriod = query.startPeriod ?? endPeriod
    if (startPeriod > endPeriod) {
      return this.throwPeriodError()
    }
    const fiscalYear = query.fiscalYear ?? periodToYear(endPeriod)
    const includeUnapproved = query.includeUnapproved ?? false

    const accounts = await this.accountRepo.find()
    const accountMap = new Map(accounts.map((a) => [a.id, a]))
    const parentMap = new Map<string, string | null>()
    for (const a of accounts) parentMap.set(a.id, a.parentId)

    /** 科目自身或其祖先是否为现金/银行科目 */
    const isCashAccount = (accountId: string): boolean => {
      let cursor: string | null = accountId
      const guard = new Set<string>()
      while (cursor && !guard.has(cursor)) {
        guard.add(cursor)
        const acc = accountMap.get(cursor)
        if (!acc) return false
        if (acc.isCash || acc.isBank) return true
        cursor = parentMap.get(cursor) ?? null
      }
      return false
    }

    /** 现金流分类 */
    const classify = (code: string): CashCategoryKey => {
      for (const prefix of INVESTING_PREFIXES) {
        if (code.startsWith(prefix)) return 'investing'
      }
      for (const codeOf of FINANCING_CODES) {
        if (code.startsWith(codeOf)) return 'financing'
      }
      return 'operating'
    }

    const categories: Record<CashCategoryKey, CategoryAgg> = {
      operating: emptyCategory('operating', '经营活动'),
      investing: emptyCategory('investing', '投资活动'),
      financing: emptyCategory('financing', '筹资活动'),
    }

    // 期间内已审核凭证
    const voucherQb = this.voucherRepo
      .createQueryBuilder('v')
      .where('v.period >= :startPeriod AND v.period <= :endPeriod', { startPeriod, endPeriod })
    if (!includeUnapproved) {
      voucherQb.andWhere('v.status = :status', { status: VoucherStatus.APPROVED })
    } else {
      voucherQb.andWhere('v.status IN (:...statuses)', {
        statuses: [VoucherStatus.APPROVED, VoucherStatus.DRAFT],
      })
    }
    const vouchers = await voucherQb.orderBy('v.voucherDate', 'ASC').addOrderBy('v.voucherNo', 'ASC').getMany()

    const detail: any[] = []
    if (vouchers.length) {
      const entries = await this.entryRepo
        .createQueryBuilder('e')
        .where('e.voucherId IN (:...ids)', { ids: vouchers.map((v) => v.id) })
        .orderBy('e.sort', 'ASC')
        .getMany()

      const byVoucher = new Map<string, VoucherEntry[]>()
      for (const e of entries) {
        const arr = byVoucher.get(e.voucherId) ?? []
        arr.push(e)
        byVoucher.set(e.voucherId, arr)
      }

      for (const v of vouchers) {
        const es = byVoucher.get(v.id) ?? []
        const cashIds = new Set(es.filter((e) => isCashAccount(e.accountId)).map((e) => e.id))
        if (cashIds.size === 0) continue
        const hasCashFlow = es.some((e) => cashIds.has(e.id) && (toCents(e.debit) > 0 || toCents(e.credit) > 0))
        if (!hasCashFlow) continue

        // 对方分录：现金借方对应流入（对方贷方），现金贷方对应流出（对方借方）
        const direction = { inflow: 0, outflow: 0 }
        for (const e of es) {
          if (cashIds.has(e.id)) continue
          const cat = classify(e.accountCode)
          const debit = toCents(e.debit)
          const credit = toCents(e.credit)
          if (debit > 0) {
            categories[cat].outflow = fromCents(toCents(categories[cat].outflow) + debit)
            direction.outflow = fromCents(toCents(direction.outflow) + debit)
          }
          if (credit > 0) {
            categories[cat].inflow = fromCents(toCents(categories[cat].inflow) + credit)
            direction.inflow = fromCents(toCents(direction.inflow) + credit)
          }
        }

        // 明细行：以现金侧分录呈现
        for (const e of es) {
          if (!cashIds.has(e.id)) continue
          const debit = toCents(e.debit)
          const credit = toCents(e.credit)
          if (debit === 0 && credit === 0) continue
          detail.push({
            voucherId: v.id,
            period: v.period,
            voucherDate: v.voucherDate,
            word: v.word,
            voucherNo: v.voucherNo,
            summary: e.summary,
            accountName: e.accountName,
            direction: debit > 0 ? 'inflow' : 'outflow',
            amount: fromCents(debit > 0 ? debit : credit),
            category: null,
          })
        }
        void direction
      }
    }

    // 期初/期末现金余额（含所有现金与银行科目）
    const closingState = await this.booksService.getClosingBalancesByCategory(endPeriod, fiscalYear, includeUnapproved)
    const closing = this.cashBalance(closingState.balances, accounts)
    // 期初须与期末保持同一会计年度上下文，否则跨年期间会漏掉该年度期初余额
    const openingPeriod = addPeriod(startPeriod, -1)
    const openingState = await this.booksService.getClosingBalancesByCategory(
      openingPeriod,
      fiscalYear,
      includeUnapproved,
    )
    const opening = this.cashBalance(openingState.balances, accounts)

    const list = Object.values(categories)
    const net = (c: CategoryAgg) => fromCents(toCents(c.inflow) - toCents(c.outflow))
    const netIncrease = fromCents(toCents(closing) - toCents(opening))
    // 分累加，避免反复 toCents 把已累加的「分」再放大 100 倍
    const sumNetCents = list.reduce<number>((acc, c) => acc + toCents(net(c)), 0)
    const sumNet = fromCents(sumNetCents)

    return {
      title: '现金流量简表',
      period: { startPeriod, endPeriod },
      startDate: periodStartDate(startPeriod),
      endDate: periodEndDate(endPeriod),
      openingBalance: opening,
      closingBalance: closing,
      netIncrease,
      categories: list.map((c) => ({ ...c, net: net(c) })),
      balanced: toCents(sumNet) === toCents(netIncrease),
      difference: fromCents(Math.abs(toCents(sumNet) - toCents(netIncrease))),
      detail,
    }
  }

  // ==================== P18.3 费用结构分析 ====================

  async expenseAnalysis(query: ReportQueryDto): Promise<any> {
    const endPeriod = query.endPeriod ?? currentPeriod()
    const startPeriod = query.startPeriod ?? endPeriod
    if (startPeriod > endPeriod) {
      return this.throwPeriodError()
    }
    const includeUnapproved = query.includeUnapproved ?? false

    const accounts = await this.accountRepo.find()
    const levelOne = new Map<string, { code: string; name: string }>()
    for (const a of accounts) {
      if (a.level === 1) levelOne.set(a.code, { code: a.code, name: a.name })
    }

    const voucherQb = this.voucherRepo
      .createQueryBuilder('v')
      .where('v.period >= :startPeriod AND v.period <= :endPeriod', { startPeriod, endPeriod })
    if (!includeUnapproved) {
      voucherQb.andWhere('v.status = :status', { status: VoucherStatus.APPROVED })
    } else {
      voucherQb.andWhere('v.status IN (:...statuses)', {
        statuses: [VoucherStatus.APPROVED, VoucherStatus.DRAFT],
      })
    }
    const vouchers = await voucherQb.orderBy('v.voucherDate', 'ASC').addOrderBy('v.voucherNo', 'ASC').getMany()
    const voucherMap = new Map(vouchers.map((v) => [v.id, v]))

    const whereParts = EXPENSE_CODES.map((c) => `e.accountCode LIKE '${c}%'`).join(' OR ')
    const entries = vouchers.length
      ? await this.entryRepo
          .createQueryBuilder('e')
          .where(`e.voucherId IN (:...ids) AND (${whereParts})`, { ids: vouchers.map((v) => v.id) })
          .getMany()
      : []

    const byAccount = new Map<string, { code: string; name: string; amount: number }>()
    const byPartner = new Map<string, { partnerId: string | null; partnerName: string; amount: number }>()
    let total = 0
    const rows: any[] = []

    for (const e of entries) {
      const voucher = voucherMap.get(e.voucherId)
      if (!voucher) continue
      const amount = fromCents(toCents(e.debit) - toCents(e.credit))
      if (amount <= 0) continue
      total = fromCents(toCents(total) + toCents(amount))

      const code = e.accountCode.slice(0, 4)
      const a = levelOne.get(code) ?? { code, name: e.accountName }
      const g = byAccount.get(code) ?? { code, name: a.name, amount: 0 }
      g.amount = fromCents(toCents(g.amount) + toCents(amount))
      byAccount.set(code, g)

      const key = e.partnerId ?? ''
      const p = byPartner.get(key) ?? { partnerId: e.partnerId, partnerName: '', amount: 0 }
      p.amount = fromCents(toCents(p.amount) + toCents(amount))
      byPartner.set(key, p)

      rows.push({
        voucherId: voucher.id,
        period: voucher.period,
        voucherDate: voucher.voucherDate,
        word: voucher.word,
        voucherNo: voucher.voucherNo,
        summary: e.summary,
        accountCode: e.accountCode,
        accountName: e.accountName,
        amount,
        partnerId: e.partnerId,
      })
    }

    // 交易对手名称
    const partnerIds = Array.from(byPartner.values())
      .map((p) => p.partnerId)
      .filter(Boolean) as string[]
    const partners = partnerIds.length
      ? await this.partnerRepo.find({ where: { id: In(partnerIds) } })
      : []
    const partnerNameMap = new Map(partners.map((p) => [p.id, p.name]))

    const percent = (v: number): number => {
      if (total <= 0) return 0
      return Math.round((v / total) * 10000) / 100
    }

    return {
      title: '费用结构分析',
      period: { startPeriod, endPeriod },
      startDate: periodStartDate(startPeriod),
      endDate: periodEndDate(endPeriod),
      total,
      byAccount: Array.from(byAccount.values())
        .map((g) => ({ ...g, percent: percent(g.amount) }))
        .sort((a, b) => b.amount - a.amount),
      byPartner: Array.from(byPartner.values())
        .map((g) => ({
          ...g,
          partnerName: g.partnerId ? partnerNameMap.get(g.partnerId) ?? '未知往来单位' : '未指定',
          percent: percent(g.amount),
        }))
        .sort((a, b) => b.amount - a.amount),
      rows: rows.map((r) => ({
        ...r,
        partnerName: r.partnerId ? partnerNameMap.get(r.partnerId) ?? null : null,
      })),
    }
  }

  // ==================== P18.4 一键月结 ====================

  async monthlyClose(query: ReportQueryDto): Promise<any> {
    const endPeriod = query.endPeriod ?? currentPeriod()
    const fiscalYear = query.fiscalYear ?? periodToYear(endPeriod)

    const [pendingReceipts, unapprovedVouchers, openPayrolls, unapprovedExpenseClaims] = await Promise.all([
      this.receiptRepo
        .createQueryBuilder('r')
        .where('r.status IN (:...statuses)', {
          statuses: [ReceiptStatus.PARSED, ReceiptStatus.DRAFTED],
        })
        .getCount(),
      this.voucherRepo.count({ where: { status: VoucherStatus.DRAFT } }),
      this.payrollRepo
        .createQueryBuilder('p')
        .where("p.status != 'paid'")
        .getCount(),
      this.expenseClaimRepo.count({ where: { status: 'draft' } }),
    ])

    const checks = {
      pendingReceipts,
      unapprovedVouchers,
      openPayrolls,
      unapprovedExpenseClaims,
    }
    const issues: string[] = []
    if (pendingReceipts > 0) {
      issues.push(`尚有 ${pendingReceipts} 张票据未确认（待确认工作台）`)
    }
    if (unapprovedVouchers > 0) {
      issues.push(`尚有 ${unapprovedVouchers} 张凭证未审核`)
    }
    if (openPayrolls > 0) {
      issues.push(`尚有 ${openPayrolls} 张工资单未发放`)
    }
    if (unapprovedExpenseClaims > 0) {
      issues.push(`尚有 ${unapprovedExpenseClaims} 张报销单未审核`)
    }

    // 报表包：资产负债表 + 利润表 + 现金流量简表 + 票据台账汇总
    const [balanceSheet, profitLoss, cashFlow, receiptLedger] = await Promise.all([
      this.reportsService.balanceSheet({ endPeriod, fiscalYear }),
      this.reportsService.profitLoss({ endPeriod, startPeriod: endPeriod, fiscalYear }),
      this.cashFlow({ endPeriod, startPeriod: endPeriod, fiscalYear }),
      this.receiptLedger({ endPeriod, startPeriod: endPeriod, fiscalYear }),
    ])

    return {
      title: '一键月结',
      period: endPeriod,
      endDate: periodEndDate(endPeriod),
      checks,
      issues,
      ready: issues.length === 0,
      report: {
        balanceSheet: {
          totalAssets: balanceSheet.totals.totalAssets,
          totalLiabilities: balanceSheet.totals.totalLiabilities,
          totalEquity: balanceSheet.totals.totalEquity,
          balanced: balanceSheet.balanced,
        },
        profitLoss: {
          operatingRevenue: profitLoss.currentPeriod.totals.operatingRevenue,
          operatingProfit: profitLoss.currentPeriod.totals.operatingProfit,
          netProfit: profitLoss.currentPeriod.totals.netProfit,
        },
        cashFlow: {
          openingBalance: cashFlow.openingBalance,
          closingBalance: cashFlow.closingBalance,
          netIncrease: cashFlow.netIncrease,
          categories: cashFlow.categories,
          balanced: cashFlow.balanced,
        },
        receiptSummary: {
          count: receiptLedger.summary.count,
          amount: receiptLedger.summary.amount,
          taxAmount: receiptLedger.summary.taxAmount,
          byType: receiptLedger.summary.byType,
        },
      },
    }
  }

  // ==================== P18.5 经营看板 ====================

  async overview(query: ReportQueryDto): Promise<any> {
    const endPeriod = query.endPeriod ?? currentPeriod()
    const startPeriod = query.startPeriod ?? endPeriod
    const fiscalYear = query.fiscalYear ?? periodToYear(endPeriod)

    const { balances, accounts } = await this.booksService.getClosingBalancesByCategory(endPeriod, fiscalYear, false)
    const byCode = new Map(accounts.map((a) => [a.code, a]))
    const netOf = (code: string): number => {
      const account = byCode.get(code)
      if (!account) return 0
      const set = balances.get(account.id)
      if (!set) return 0
      // balances 内部金额单位是「分」
      const periodNet = set.periodDebit - set.periodCredit
      return fromCents(account.direction === BalanceDirection.DEBIT ? periodNet : -periodNet)
    }
    const closingOf = (code: string): number => {
      const account = byCode.get(code)
      if (!account) return 0
      const set = balances.get(account.id)
      if (!set) return 0
      return fromCents(
        account.direction === BalanceDirection.DEBIT
          ? set.closeDebit - set.closeCredit
          : set.closeCredit - set.closeDebit,
      )
    }

    const income = fromCents(toCents(netOf('6001')) + toCents(netOf('6051')))
    const expense = fromCents(EXPENSE_CODES.reduce<number>((acc, code) => acc + toCents(netOf(code)), 0))

    // 税负：应交税费（2221）本期借方=实缴、贷方=计提（科目为 credit 方向）
    const taxAccount = byCode.get('2221')
    let taxPaidAmount = 0
    let taxAccruedAmount = 0
    if (taxAccount) {
      const set = balances.get(taxAccount.id)
      if (set) {
        taxPaidAmount = fromCents(Math.max(set.periodDebit - set.periodCredit, 0))
        taxAccruedAmount = fromCents(Math.max(set.periodCredit - set.periodDebit, 0))
      }
    }

    const [pendingReceipts, monthVoucherCount] = await Promise.all([
      this.receiptRepo
        .createQueryBuilder('r')
        .where('r.status IN (:...statuses)', {
          statuses: [ReceiptStatus.PARSED, ReceiptStatus.DRAFTED],
        })
        .getCount(),
      this.voucherRepo
        .createQueryBuilder('v')
        .where('v.period = :period', { period: endPeriod })
        .getCount(),
    ])

    const cashBalance = fromCents(
      accounts
        .filter((a) => a.isCash || a.isBank)
        .reduce<number>((acc, a) => {
          const set = balances.get(a.id)
          if (!set) return acc
          return acc + (set.closeDebit - set.closeCredit)
        }, 0),
    )

    return {
      period: endPeriod,
      month: {
        income,
        expense: fromCents(expense),
        netProfit: fromCents(toCents(income) - toCents(expense)),
        taxPaid: taxPaidAmount,
        taxAccrued: taxAccruedAmount,
      },
      balance: {
        cash: cashBalance,
        receivable: closingOf('1122'),
        payable: closingOf('2202'),
      },
      pendingReceipts,
      monthVoucherCount,
    }
  }

  // ==================== 内部 ====================

  private cashBalance(
    balances: Map<string, { closeDebit: number; closeCredit: number }>,
    accounts: Account[],
  ): number {
    // balances 为 computeBalances 原样返回，内部金额单位是「分」
    return fromCents(
      accounts
        .filter((a) => a.isCash || a.isBank)
        .reduce<number>((acc, a) => {
          const set = balances.get(a.id)
          if (!set) return acc
          return acc + (set.closeDebit - set.closeCredit)
        }, 0),
    )
  }

  private receiptStatusLabel(status: string): string {
    const map: Record<string, string> = {
      parsed: '已解析',
      drafted: '草稿',
      confirmed: '已确认',
      rejected: '已驳回',
      duplicate: '重复',
      failed: '失败',
    }
    return map[status] ?? status
  }

  private throwPeriodError(): never {
    throw new BadRequestException('起始期间不能大于结束期间')
  }
}
