import { Injectable } from '@nestjs/common'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Account } from '../../entities/account.entity'
import { Voucher } from '../../entities/voucher.entity'
import { VoucherEntry } from '../../entities/voucher-entry.entity'
import { InitialBalance } from '../../entities/initial-balance.entity'
import { Partner } from '../../entities/partner.entity'
import { Department } from '../../entities/department.entity'
import { Project } from '../../entities/project.entity'
import { AccountCategory, BalanceDirection, VoucherStatus } from '../../common/enums'
import { toCents, fromCents } from '../../common/utils/money.util'
import {
  currentPeriod,
  periodToYear,
  yearStartDate,
} from '../../common/utils/date.util'
import type { BooksQueryDto, LedgerQueryDto } from './dto/books.dto'

interface AmountSet {
  openDebit: number
  openCredit: number
  periodDebit: number
  periodCredit: number
  closeDebit: number
  closeCredit: number
}

const emptyAmount = (): AmountSet => ({
  openDebit: 0,
  openCredit: 0,
  periodDebit: 0,
  periodCredit: 0,
  closeDebit: 0,
  closeCredit: 0,
})

/** 对外暴露的余额字段 */
export interface SerializedAmounts {
  openingDebit: number
  openingCredit: number
  openingBalance: number
  openingDirection: BalanceDirection
  periodDebit: number
  periodCredit: number
  closingDebit: number
  closingCredit: number
  closingBalance: number
  closingDirection: BalanceDirection
}

/** 辅助核算组合的最小结构 */
interface AuxRow {
  partnerId: string | null
  departmentId: string | null
  projectId: string | null
}

@Injectable()
export class BooksService {
  constructor(
    @InjectRepository(Account) private readonly accountRepo: Repository<Account>,
    @InjectRepository(Voucher) private readonly voucherRepo: Repository<Voucher>,
    @InjectRepository(VoucherEntry) private readonly entryRepo: Repository<VoucherEntry>,
    @InjectRepository(InitialBalance)
    private readonly initialBalanceRepo: Repository<InitialBalance>,
    @InjectRepository(Partner) private readonly partnerRepo: Repository<Partner>,
    @InjectRepository(Department) private readonly deptRepo: Repository<Department>,
    @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
  ) {}

  // ==================== 公共计算内核 ====================

  /**
   * 计算指定期间范围内所有科目的余额集合（含未审核开关）
   * 返回 Map<accountId, AmountSet>
   */
  async computeBalances(query: BooksQueryDto): Promise<{
    balances: Map<string, AmountSet>
    accounts: Account[]
    startPeriod: number
    endPeriod: number
    fiscalYear: number
  }> {
    const endPeriod = query.endPeriod ?? currentPeriod()
    const startPeriod = query.startPeriod ?? endPeriod
    const fiscalYear = query.fiscalYear ?? periodToYear(endPeriod)

    if (startPeriod > endPeriod) {
      throw new BadRequestException('起始期间不能大于结束期间')
    }

    const accounts = await this.accountRepo.find({ order: { code: 'ASC' } })
    const accountMap = new Map(accounts.map((a) => [a.id, a]))
    // 父级链路：用于把发生额向上汇总
    const parentMap = new Map<string, string | null>()
    for (const a of accounts) parentMap.set(a.id, a.parentId)

    const balances = new Map<string, AmountSet>()
    for (const a of accounts) balances.set(a.id, emptyAmount())

    /** 把金额累加到科目及其所有祖先 */
    const addTo = (accountId: string, field: keyof AmountSet, cents: number): void => {
      let cursor: string | null = accountId
      const guard = new Set<string>()
      while (cursor && !guard.has(cursor)) {
        guard.add(cursor)
        const target = balances.get(cursor)
        if (target) (target as any)[field] += cents
        cursor = parentMap.get(cursor) ?? null
      }
    }

    // 1) 期初余额（会计年度期初）
    const yearStart = periodToYear(startPeriod) * 100 + 1
    const initialRows = await this.initialBalanceRepo.find({ where: { fiscalYear } })
    for (const row of initialRows) {
      const cents = toCents(row.amount)
      const field: keyof AmountSet = row.direction === BalanceDirection.DEBIT ? 'openDebit' : 'openCredit'
      addTo(row.accountId, field, cents)
    }

    // 2) 凭证分录：年度起始 ~ 结束期间
    // 注意：不要给主键列起别名，否则 getMany() 无法构建实体
    const voucherQb = this.voucherRepo
      .createQueryBuilder('v')
      .select(['v.id', 'v.voucherNo', 'v.voucherDate', 'v.word', 'v.period'])
      .where('v.period >= :yearStart AND v.period <= :endPeriod', { yearStart, endPeriod })

    if (!query.includeUnapproved) {
      voucherQb.andWhere('v.status = :status', { status: VoucherStatus.APPROVED })
    } else {
      voucherQb.andWhere('v.status IN (:...statuses)', {
        statuses: [VoucherStatus.APPROVED, VoucherStatus.DRAFT],
      })
    }

    const vouchers = await voucherQb.getMany()
    const voucherMap = new Map(vouchers.map((v) => [v.id, v]))

    if (vouchers.length) {
      const entries = await this.entryRepo
        .createQueryBuilder('e')
        .where('e.voucherId IN (:...ids)', { ids: vouchers.map((v) => v.id) })
        .orderBy('e.sort', 'ASC')
        .getMany()

      for (const e of entries) {
        if (!accountMap.has(e.accountId)) continue
        const voucher = voucherMap.get(e.voucherId)!
        if (voucher.period < startPeriod) {
          // 计入期初方向
          const d = toCents(e.debit)
          const c = toCents(e.credit)
          if (d > 0) addTo(e.accountId, 'openDebit', d)
          if (c > 0) addTo(e.accountId, 'openCredit', c)
        } else {
          addTo(e.accountId, 'periodDebit', toCents(e.debit))
          addTo(e.accountId, 'periodCredit', toCents(e.credit))
        }
      }
    }

    // 3) 依据科目余额方向推导期末余额
    for (const a of accounts) {
      const set = balances.get(a.id)!
      const openNet = set.openDebit - set.openCredit
      const closeNet = openNet + set.periodDebit - set.periodCredit
      if (a.direction === BalanceDirection.DEBIT) {
        set.closeDebit = Math.max(closeNet, 0)
        set.closeCredit = Math.max(-closeNet, 0)
      } else {
        set.closeCredit = Math.max(-closeNet, 0)
        set.closeDebit = Math.max(closeNet, 0)
      }
    }

    return { balances, accounts, startPeriod, endPeriod, fiscalYear }
  }

  /** 将 cents 汇总值转换为元 */
  private toAmount(cents: number): number {
    return fromCents(cents)
  }

  private serialize(set: AmountSet): SerializedAmounts {
    return {
      openingDebit: this.toAmount(set.openDebit),
      openingCredit: this.toAmount(set.openCredit),
      openingBalance:
        this.toAmount(
          set.openDebit - set.openCredit >= 0 ? set.openDebit - set.openCredit : set.openCredit - set.openDebit,
        ),
      openingDirection:
        set.openDebit - set.openCredit >= 0 ? BalanceDirection.DEBIT : BalanceDirection.CREDIT,
      periodDebit: this.toAmount(set.periodDebit),
      periodCredit: this.toAmount(set.periodCredit),
      closingDebit: this.toAmount(set.closeDebit),
      closingCredit: this.toAmount(set.closeCredit),
      closingBalance:
        this.toAmount(
          set.closeDebit - set.closeCredit >= 0 ? set.closeDebit - set.closeCredit : set.closeCredit - set.closeDebit,
        ),
      closingDirection:
        set.closeDebit - set.closeCredit >= 0 ? BalanceDirection.DEBIT : BalanceDirection.CREDIT,
    }
  }

  // ==================== 总账 ====================

  /**
   * 总账：按科目 + 日期区间逐笔列出并计算余额
   */
  async ledger(query: LedgerQueryDto & { accountId: string }): Promise<any> {
    const account = await this.accountRepo.findOne({ where: { id: query.accountId } })
    if (!account) throw new NotFoundException('会计科目不存在')

    const { balances, startPeriod, endPeriod } = await this.computeBalances({
      ...query,
      accountIds: [query.accountId],
    })
    const accountSet = balances.get(account.id) ?? emptyAmount()

    const voucherQb = this.voucherRepo
      .createQueryBuilder('v')
      .where('v.period >= :yearStart AND v.period <= :endPeriod', {
        yearStart: periodToYear(startPeriod) * 100 + 1,
        endPeriod,
      })

    if (!query.includeUnapproved) {
      voucherQb.andWhere('v.status = :status', { status: VoucherStatus.APPROVED })
    } else {
      voucherQb.andWhere('v.status IN (:...statuses)', {
        statuses: [VoucherStatus.APPROVED, VoucherStatus.DRAFT],
      })
    }

    const vouchers = await voucherQb.orderBy('v.voucherDate', 'ASC').addOrderBy('v.voucherNo', 'ASC').getMany()
    const voucherMap = new Map(vouchers.map((v) => [v.id, v]))

    const entries = await this.entryRepo.find({
      where: { accountId: account.id },
      order: { sort: 'ASC' },
    })

    // 运行余额从期初开始
    let running = account.direction === BalanceDirection.DEBIT
      ? accountSet.openDebit - accountSet.openCredit
      : -(accountSet.openDebit - accountSet.openCredit)

    const inRange = entries.filter((e) => {
      const v = voucherMap.get(e.voucherId)
      return v && v.period >= startPeriod && v.period <= endPeriod
    })

    const rows: any[] = []
    for (const e of inRange) {
      const v = voucherMap.get(e.voucherId)!
      const d = toCents(e.debit)
      const c = toCents(e.credit)
      running += account.direction === BalanceDirection.DEBIT ? d - c : c - d
      rows.push({
        voucherId: v.id,
        period: v.period,
        voucherDate: v.voucherDate,
        word: v.word,
        voucherNo: v.voucherNo,
        summary: e.summary,
        debit: this.toAmount(d),
        credit: this.toAmount(c),
        direction: running >= 0 ? BalanceDirection.DEBIT : BalanceDirection.CREDIT,
        balance: this.toAmount(Math.abs(running)),
        partnerId: e.partnerId,
        departmentId: e.departmentId,
        projectId: e.projectId,
        status: v.status,
      })
    }

    const periodDebit = inRange.reduce<number>((acc, e) => acc + toCents(e.debit), 0)
    const periodCredit = inRange.reduce<number>((acc, e) => acc + toCents(e.credit), 0)

    return {
      account: {
        id: account.id,
        code: account.code,
        name: account.name,
        fullName: account.fullName,
        category: account.category,
        direction: account.direction,
      },
      period: { startPeriod, endPeriod },
      summary: {
        ...this.serialize(accountSet),
        periodDebit: this.toAmount(periodDebit),
        periodCredit: this.toAmount(periodCredit),
      },
      rows,
    }
  }

  // ==================== 明细账 ====================

  /**
   * 明细账：按科目 + 辅助核算组合展开
   */
  async subLedger(query: LedgerQueryDto & { accountId: string }): Promise<any> {
    const account = await this.accountRepo.findOne({ where: { id: query.accountId } })
    if (!account) throw new NotFoundException('会计科目不存在')

    const endPeriod = query.endPeriod ?? currentPeriod()
    const startPeriod = query.startPeriod ?? endPeriod
    const fiscalYear = query.fiscalYear ?? periodToYear(endPeriod)

    // 辅助核算名称
    const auxNames = await this.loadAuxNames()

    // 分组 key
    const groupKey = (e: AuxRow): string =>
      `${e.partnerId ?? '-'}|${e.departmentId ?? '-'}|${e.projectId ?? '-'}`

    // 1) 期初按辅助组合
    const initialRows = await this.initialBalanceRepo.find({
      where: { fiscalYear, accountId: account.id },
    })
    const groups = new Map<
      string,
      { openDebit: number; openCredit: number; periodDebit: number; periodCredit: number }
    >()
    const ensure = (key: string) => {
      if (!groups.has(key)) {
        groups.set(key, { openDebit: 0, openCredit: 0, periodDebit: 0, periodCredit: 0 })
      }
      return groups.get(key)!
    }
    for (const row of initialRows) {
      const key = groupKey(row)
      const g = ensure(key)
      if (row.direction === BalanceDirection.DEBIT) g.openDebit += toCents(row.amount)
      else g.openCredit += toCents(row.amount)
    }

    // 2) 凭证分录
    const voucherQb = this.voucherRepo
      .createQueryBuilder('v')
      .where('v.period >= :yearStart AND v.period <= :endPeriod', {
        yearStart: periodToYear(startPeriod) * 100 + 1,
        endPeriod,
      })
    if (!query.includeUnapproved) {
      voucherQb.andWhere('v.status = :status', { status: VoucherStatus.APPROVED })
    } else {
      voucherQb.andWhere('v.status IN (:...statuses)', {
        statuses: [VoucherStatus.APPROVED, VoucherStatus.DRAFT],
      })
    }
    const vouchers = await voucherQb.orderBy('v.voucherDate', 'ASC').addOrderBy('v.voucherNo', 'ASC').getMany()
    const voucherMap = new Map(vouchers.map((v) => [v.id, v]))

    const entries = await this.entryRepo.find({
      where: { accountId: account.id },
      order: { sort: 'ASC' },
    })

    const entriesInRange: VoucherEntry[] = []
    for (const e of entries) {
      const v = voucherMap.get(e.voucherId)
      if (!v) continue
      const key = groupKey(e)
      const g = ensure(key)
      if (v.period < startPeriod) {
        g.openDebit += toCents(e.debit)
        g.openCredit += toCents(e.credit)
      } else if (v.period <= endPeriod) {
        g.periodDebit += toCents(e.debit)
        g.periodCredit += toCents(e.credit)
        entriesInRange.push(e)
      }
    }

    // 3) 生成按辅助组合分组的明细行
    const list = Array.from(groups.entries())
      .filter(([key, g]) => key !== '-|-|-' || g.openDebit || g.openCredit || g.periodDebit || g.periodCredit)
      .map(([key, g]) => {
        const [partnerId, departmentId, projectId] = key.split('|')
        const openNet = g.openDebit - g.openCredit
        const closeNet = openNet + g.periodDebit - g.periodCredit
        const sign = account.direction === BalanceDirection.DEBIT ? 1 : -1
        return {
          key,
          partnerId: partnerId === '-' ? null : partnerId,
          partnerName: partnerId === '-' ? null : auxNames.partner.get(partnerId) ?? null,
          departmentId: departmentId === '-' ? null : departmentId,
          departmentName: departmentId === '-' ? null : auxNames.department.get(departmentId) ?? null,
          projectId: projectId === '-' ? null : projectId,
          projectName: projectId === '-' ? null : auxNames.project.get(projectId) ?? null,
          openingDebit: this.toAmount(Math.max(openNet * sign, 0)),
          openingCredit: this.toAmount(Math.max(-openNet * sign, 0)),
          periodDebit: this.toAmount(g.periodDebit),
          periodCredit: this.toAmount(g.periodCredit),
          closingDebit: this.toAmount(Math.max(closeNet * sign, 0)),
          closingCredit: this.toAmount(Math.max(-closeNet * sign, 0)),
          entries: [] as any[],
        }
      })
      .filter((g) => {
        if (!query.partnerIds?.length) return true
        return g.partnerId && query.partnerIds.includes(g.partnerId)
      })
      .filter((g) => {
        if (!query.departmentIds?.length) return true
        return g.departmentId && query.departmentIds.includes(g.departmentId)
      })
      .filter((g) => {
        if (!query.projectIds?.length) return true
        return g.projectId && query.projectIds.includes(g.projectId)
      })

    // 明细行归属分组
    const groupIndex = new Map(list.map((g) => [g.key, g]))
    const runningMap = new Map<string, number>()
    for (const g of list) {
      runningMap.set(
        g.key,
        account.direction === BalanceDirection.DEBIT
          ? g.openingDebit - g.openingCredit
          : -(g.openingDebit - g.openingCredit),
      )
    }

    for (const e of entriesInRange) {
      const key = groupKey(e)
      const group = groupIndex.get(key)
      if (!group) continue
      const v = voucherMap.get(e.voucherId)!
      const sign = account.direction === BalanceDirection.DEBIT ? 1 : -1
      const running = (runningMap.get(key) ?? 0) + sign * (toCents(e.debit) - toCents(e.credit))
      runningMap.set(key, running)
      group.entries.push({
        voucherId: v.id,
        period: v.period,
        voucherDate: v.voucherDate,
        word: v.word,
        voucherNo: v.voucherNo,
        summary: e.summary,
        debit: this.toAmount(toCents(e.debit)),
        credit: this.toAmount(toCents(e.credit)),
        direction: running >= 0 ? BalanceDirection.DEBIT : BalanceDirection.CREDIT,
        balance: this.toAmount(Math.abs(running)),
        status: v.status,
      })
    }

    const totals = list.reduce(
      (acc, g) => ({
        openingDebit: acc.openingDebit + toCents(g.openingDebit),
        openingCredit: acc.openingCredit + toCents(g.openingCredit),
        periodDebit: acc.periodDebit + toCents(g.periodDebit),
        periodCredit: acc.periodCredit + toCents(g.periodCredit),
        closingDebit: acc.closingDebit + toCents(g.closingDebit),
        closingCredit: acc.closingCredit + toCents(g.closingCredit),
      }),
      { openingDebit: 0, openingCredit: 0, periodDebit: 0, periodCredit: 0, closingDebit: 0, closingCredit: 0 },
    )

    return {
      account: {
        id: account.id,
        code: account.code,
        name: account.name,
        fullName: account.fullName,
        category: account.category,
        direction: account.direction,
      },
      period: { startPeriod, endPeriod },
      groups: list,
      totals: {
        openingDebit: this.toAmount(totals.openingDebit),
        openingCredit: this.toAmount(totals.openingCredit),
        periodDebit: this.toAmount(totals.periodDebit),
        periodCredit: this.toAmount(totals.periodCredit),
        closingDebit: this.toAmount(totals.closingDebit),
        closingCredit: this.toAmount(totals.closingCredit),
      },
    }
  }

  // ==================== 科目余额表 ====================

  async balanceTable(query: BooksQueryDto): Promise<any> {
    const { balances, accounts, startPeriod, endPeriod } = await this.computeBalances(query)

    const filterIds = query.accountIds?.length ? new Set(query.accountIds) : null
    const filterCodes = query.accountCodes?.length ? new Set(query.accountCodes) : null

    // 需要保留：明细科目 + 非零金额的父级
    const rows = accounts
      .map((a) => {
        const set = balances.get(a.id)!
        const s = this.serialize(set)
        const hasAmount =
          s.openingDebit !== 0 ||
          s.openingCredit !== 0 ||
          s.periodDebit !== 0 ||
          s.periodCredit !== 0 ||
          s.closingDebit !== 0 ||
          s.closingCredit !== 0
        return {
          id: a.id,
          code: a.code,
          name: a.name,
          fullName: a.fullName,
          level: a.level,
          category: a.category,
          direction: a.direction,
          isLeaf: a.isLeaf,
          status: a.status,
          parentId: a.parentId,
          hasAmount,
          ...s,
        }
      })
      .filter((r) => {
        if (filterIds) return filterIds.has(r.id) || r.hasAmount
        if (filterCodes) return filterCodes.has(r.code) || r.hasAmount
        return r.hasAmount || !r.isLeaf
      })

    const totals = rows.reduce(
      (acc, r) => ({
        openingDebit: acc.openingDebit + toCents(r.openingDebit),
        openingCredit: acc.openingCredit + toCents(r.openingCredit),
        periodDebit: acc.periodDebit + toCents(r.periodDebit),
        periodCredit: acc.periodCredit + toCents(r.periodCredit),
        closingDebit: acc.closingDebit + toCents(r.closingDebit),
        closingCredit: acc.closingCredit + toCents(r.closingCredit),
      }),
      { openingDebit: 0, openingCredit: 0, periodDebit: 0, periodCredit: 0, closingDebit: 0, closingCredit: 0 },
    )

    return {
      period: { startPeriod, endPeriod },
      rows,
      totals: {
        openingDebit: this.toAmount(totals.openingDebit),
        openingCredit: this.toAmount(totals.openingCredit),
        periodDebit: this.toAmount(totals.periodDebit),
        periodCredit: this.toAmount(totals.periodCredit),
        closingDebit: this.toAmount(totals.closingDebit),
        closingCredit: this.toAmount(totals.closingCredit),
      },
    }
  }

  // ==================== 试算平衡表 ====================

  async trialBalance(query: BooksQueryDto): Promise<any> {
    const { balances, accounts, startPeriod, endPeriod } = await this.computeBalances(query)

    const rows = accounts
      .filter((a) => a.level === 1)
      .map((a) => {
        const set = balances.get(a.id)!
        const s = this.serialize(set)
        return {
          id: a.id,
          code: a.code,
          name: a.name,
          category: a.category,
          direction: a.direction,
          ...s,
        }
      })
      .filter(
        (r) =>
          r.openingDebit !== 0 ||
          r.openingCredit !== 0 ||
          r.periodDebit !== 0 ||
          r.periodCredit !== 0 ||
          r.closingDebit !== 0 ||
          r.closingCredit !== 0,
      )

    const sums = rows.reduce(
      (acc, r) => ({
        openingDebit: acc.openingDebit + toCents(r.openingDebit),
        openingCredit: acc.openingCredit + toCents(r.openingCredit),
        periodDebit: acc.periodDebit + toCents(r.periodDebit),
        periodCredit: acc.periodCredit + toCents(r.periodCredit),
        closingDebit: acc.closingDebit + toCents(r.closingDebit),
        closingCredit: acc.closingCredit + toCents(r.closingCredit),
      }),
      { openingDebit: 0, openingCredit: 0, periodDebit: 0, periodCredit: 0, closingDebit: 0, closingCredit: 0 },
    )

    const difference = Math.abs(sums.closingDebit - sums.closingCredit)

    return {
      period: { startPeriod, endPeriod },
      rows,
      totals: {
        openingDebit: this.toAmount(sums.openingDebit),
        openingCredit: this.toAmount(sums.openingCredit),
        periodDebit: this.toAmount(sums.periodDebit),
        periodCredit: this.toAmount(sums.periodCredit),
        closingDebit: this.toAmount(sums.closingDebit),
        closingCredit: this.toAmount(sums.closingCredit),
      },
      balanced: difference === 0,
      difference: this.toAmount(difference),
    }
  }

  // ==================== 辅助 ====================

  /** 按期间取所有科目期末余额（供报表使用） */
  async getClosingBalancesByCategory(
    endPeriod: number,
    fiscalYear: number,
    includeUnapproved = false,
  ): Promise<{ balances: Map<string, AmountSet>; accounts: Account[] }> {
    const result = await this.computeBalances({
      startPeriod: endPeriod,
      endPeriod,
      fiscalYear,
      includeUnapproved,
    })
    return { balances: result.balances, accounts: result.accounts }
  }

  /** 取某科目在本年内的累计发生额（用于利润表本年累计） */
  async getYearToDateAmounts(
    endPeriod: number,
    fiscalYear: number,
    includeUnapproved = false,
  ): Promise<Map<string, { debit: number; credit: number }>> {
    const result = new Map<string, { debit: number; credit: number }>()
    const accounts = await this.accountRepo.find()
    const accountMap = new Map(accounts.map((a) => [a.id, a]))
    const parentMap = new Map(accounts.map((a) => [a.id, a.parentId]))

    const yearStart = fiscalYear * 100 + 1

    const voucherQb = this.voucherRepo
      .createQueryBuilder('v')
      .select(['v.id'])
      .where('v.period >= :yearStart AND v.period <= :endPeriod', { yearStart, endPeriod })

    if (!includeUnapproved) {
      voucherQb.andWhere('v.status = :status', { status: VoucherStatus.APPROVED })
    } else {
      voucherQb.andWhere('v.status IN (:...statuses)', {
        statuses: [VoucherStatus.APPROVED, VoucherStatus.DRAFT],
      })
    }

    const vouchers = await voucherQb.getMany()
    if (vouchers.length) {
      const entries = await this.entryRepo
        .createQueryBuilder('e')
        .where('e.voucherId IN (:...ids)', { ids: vouchers.map((v) => v.id) })
        .getMany()

      for (const e of entries) {
        if (!accountMap.has(e.accountId)) continue
        let cursor: string | null = e.accountId
        const guard = new Set<string>()
        while (cursor && !guard.has(cursor)) {
          guard.add(cursor)
          if (!result.has(cursor)) result.set(cursor, { debit: 0, credit: 0 })
          const target = result.get(cursor)!
          target.debit += toCents(e.debit)
          target.credit += toCents(e.credit)
          cursor = parentMap.get(cursor) ?? null
        }
      }
    }

    for (const [key, value] of result) {
      result.set(key, { debit: this.toAmount(value.debit), credit: this.toAmount(value.credit) })
    }
    return result
  }

  /** 按类别汇总期末余额（一级科目） */
  categoryTotals(balances: Map<string, AmountSet>, accounts: Account[]): Record<AccountCategory, number> {
    const result: Record<string, number> = {}
    for (const a of accounts) {
      if (a.level !== 1) continue
      const set = balances.get(a.id)
      if (!set) continue
      const amount =
        a.direction === BalanceDirection.DEBIT ? set.closeDebit - set.closeCredit : set.closeCredit - set.closeDebit
      result[a.category] = (result[a.category] ?? 0) + amount
    }
    return result as Record<AccountCategory, number>
  }

  /** 载入辅助核算名称 */
  private async loadAuxNames(): Promise<{
    partner: Map<string, string>
    department: Map<string, string>
    project: Map<string, string>
  }> {
    const [partners, depts, projects] = await Promise.all([
      this.partnerRepo.find(),
      this.deptRepo.find(),
      this.projectRepo.find(),
    ])
    return {
      partner: new Map(partners.map((p) => [p.id, p.name])),
      department: new Map(depts.map((d) => [d.id, d.name])),
      project: new Map(projects.map((p) => [p.id, p.name])),
    }
  }

  /** 当前年度起始日期（供报表使用） */
  fiscalYearStart(fiscalYear: number): string {
    return yearStartDate(fiscalYear * 100 + 1)
  }
}