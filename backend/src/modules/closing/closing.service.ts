import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { In } from 'typeorm'
import { Account } from '../../entities/account.entity'
import { Voucher } from '../../entities/voucher.entity'
import { VoucherEntry } from '../../entities/voucher-entry.entity'
import { Partner } from '../../entities/partner.entity'
import { Department } from '../../entities/department.entity'
import { Project } from '../../entities/project.entity'
import { Employee } from '../../entities/hr.entity'
import { InitialBalance } from '../../entities/initial-balance.entity'
import {
  AccountCategory,
  BalanceDirection,
  VoucherSource,
  VoucherStatus,
  VoucherWord,
} from '../../common/enums'
import { fromCents, toCents } from '../../common/utils/money.util'
import { currentPeriod, periodEndDate, toPeriod } from '../../common/utils/date.util'
import { CompanyScopedRepository } from '../../common/company/company.repository'
import { InjectCompanyRepo } from '../../common/company/company-repo.decorator'
import { VouchersService } from '../vouchers/vouchers.service'
import { InitialBalanceService } from '../initial-balance/initial-balance.service'
import type { Operator } from '../../common/types/operator'
import type { VoucherEntryDto } from '../vouchers/dto/voucher.dto'
import type { ClosingExecuteDto, ClosingQueryDto } from './dto/closing.dto'

/** 本年利润科目编码（未分配前挂在 3102） */
const PROFIT_ACCOUNT_CODE = '3102'

/** 未分配利润科目编码 */
const UNDISTRIBUTED_PROFIT_CODE = '3103.01'

/** 结转摘要 */
const CLOSING_SUMMARY = '结转本期损益'

/** 年末结转摘要 */
const YEAR_END_SUMMARY = '结转本年利润至未分配利润'

/** 参与结转的损益发生额（按科目 + 辅助核算组合聚合） */
interface ProfitRow {
  accountId: string
  accountCode: string
  accountName: string
  /** 余额方向（借/贷），即该科目此时的余额落在哪一方 */
  direction: BalanceDirection
  /** 余额绝对值 */
  amount: number
  /** 结转时记入的方向：借方余额→贷方结转，贷方余额→借方结转 */
  closingDirection: BalanceDirection
  partnerId: string | null
  departmentId: string | null
  projectId: string | null
  employeeId: string | null
  partnerName: string | null
  departmentName: string | null
  projectName: string | null
  employeeName: string | null
}

export interface ClosingPreview {
  period: number
  voucherDate: string
  profitAccount: { id: string; code: string; name: string } | null
  rows: ProfitRow[]
  /** 损益类借方合计（费用结转到本年利润借方） */
  expenseTotal: number
  /** 损益类贷方合计（收入结转到本年利润贷方） */
  revenueTotal: number
  /** 本期利润（收入 - 费用），正数为盈利 */
  netProfit: number
  /** 预览分录 */
  entries: VoucherEntryDto[]
  /** 本期是否已结转 */
  closed: boolean
  existingVoucher: {
    id: string
    word: string
    voucherNo: number
    voucherDate: string
    status: string
    debitTotal: number
    creditTotal: number
  } | null
  /** 本期未审核凭证数（>0 时不允许结转） */
  draftCount: number
  /** 12 月年末结转本年利润到未分配利润；非 12 月为 null */
  yearEnd: {
    /** 本年利润余额绝对值 */
    profitBalance: number
    /** 3102 余额方向：贷方为盈利，借方为亏损 */
    direction: BalanceDirection
    entries: VoucherEntryDto[]
    undistributedAccount: { id: string; code: string; name: string } | null
    /** 年末结转后自动生成下一年期初余额的结果（仅执行时返回） */
    carryForward?: { created: number; skipped: boolean }
  } | null
}

/**
 * 期末结转损益。
 *
 * 会计处理：把损益类（category=profit）科目的本期余额全部转入「本年利润」——
 * 收入类 借 收入 / 贷 本年利润，费用类 借 本年利润 / 贷 费用。
 *
 * 三个约束（与手工做账一致）：
 * 1. 只结转已审核凭证，本期存在未审核凭证时拒绝结转；
 * 2. 同一期间只允许一张结转凭证，已结转需先「取消结转」；
 * 3. 按「科目 + 辅助核算」拆分结转，保证 6001（往来单位）/6601（部门）等
 *    声明了辅助核算的科目不会因为缺辅助项而无法记账。
 */
@Injectable()
export class ClosingService {
  constructor(
    @InjectCompanyRepo(Account) private readonly accountRepo: CompanyScopedRepository<Account>,
    @InjectCompanyRepo(Voucher) private readonly voucherRepo: CompanyScopedRepository<Voucher>,
    @InjectCompanyRepo(VoucherEntry) private readonly entryRepo: CompanyScopedRepository<VoucherEntry>,
    @InjectCompanyRepo(Partner) private readonly partnerRepo: CompanyScopedRepository<Partner>,
    @InjectCompanyRepo(Department) private readonly deptRepo: CompanyScopedRepository<Department>,
    @InjectCompanyRepo(Project) private readonly projectRepo: CompanyScopedRepository<Project>,
    @InjectCompanyRepo(Employee) private readonly employeeRepo: CompanyScopedRepository<Employee>,
    @InjectCompanyRepo(InitialBalance)
    private readonly initialBalanceRepo: CompanyScopedRepository<InitialBalance>,
    private readonly vouchersService: VouchersService,
    private readonly initialBalanceService: InitialBalanceService,
  ) {}

  /** 结转预览（不落库） */
  async preview(query: ClosingQueryDto): Promise<ClosingPreview> {
    const period = query.period ?? currentPeriod()
    const built = await this.build(period)
    const yearEnd = await this.buildYearEnd(period, built.profitCents)
    const [existing, draftCount] = await Promise.all([
      this.findClosingVoucher(period),
      this.voucherRepo.count({ where: { period, status: VoucherStatus.DRAFT } }),
    ])

    return {
      period,
      voucherDate: periodEndDate(period),
      profitAccount: built.profitAccount
        ? { id: built.profitAccount.id, code: built.profitAccount.code, name: built.profitAccount.name }
        : null,
      rows: built.rows,
      expenseTotal: fromCents(built.expenseCents),
      revenueTotal: fromCents(built.revenueCents),
      netProfit: fromCents(built.revenueCents - built.expenseCents),
      entries: built.entries,
      closed: Boolean(existing),
      existingVoucher: existing
        ? {
            id: existing.id,
            word: existing.word,
            voucherNo: existing.voucherNo,
            voucherDate: existing.voucherDate,
            status: existing.status,
            debitTotal: existing.debitTotal,
            creditTotal: existing.creditTotal,
          }
        : null,
      draftCount,
      yearEnd,
    }
  }

  /** 执行结转：生成已审核的结转凭证 */
  async execute(dto: ClosingExecuteDto, operator: Operator): Promise<ClosingPreview> {
    const period = dto.period
    const existing = await this.findClosingVoucher(period)
    if (existing) {
      const no = `${existing.word}-${String(existing.voucherNo).padStart(4, '0')}`
      throw new BadRequestException(`本期已结转（${no}），如需重做请先取消结转`)
    }

    // 后期已结转时不允许再结转本期，否则会打乱各期余额
    const laterClosed = await this.findLaterClosingPeriods(period)
    if (laterClosed.length) {
      throw new BadRequestException(
        `后期已结转（${laterClosed.join('、')}），请先取消后期结转后再结转本期`,
      )
    }

    // 期初余额借贷不平衡时，结转后的报表一定不平，先拦住
    const balance = await this.initialBalanceService.checkBalance(Math.floor(period / 100))
    if (!balance.balanced) {
      throw new BadRequestException(
        `期初余额借贷不平衡（借方 ${balance.debitTotal}，贷方 ${balance.creditTotal}，` +
          `差额 ${balance.difference}），请先调整期初余额后再结转`,
      )
    }

    const draftCount = await this.voucherRepo.count({
      where: { period, status: VoucherStatus.DRAFT },
    })
    if (draftCount > 0) {
      throw new BadRequestException(`本期还有 ${draftCount} 张未审核凭证，请先审核后再结转损益`)
    }

    const built = await this.build(period)
    if (!built.entries.length) {
      throw new BadRequestException('本期没有需要结转的损益发生额')
    }
    if (!built.profitAccount) {
      throw new BadRequestException(`未找到「本年利润」科目（编码 ${PROFIT_ACCOUNT_CODE}），请先在会计科目中维护`)
    }

    const voucherDate = dto.voucherDate ?? periodEndDate(period)
    if (toPeriod(voucherDate) !== period) {
      throw new BadRequestException('结转凭证日期必须落在结转期间内')
    }

    const remark = dto.remark
      ? `${period} 期末结转损益：${dto.remark}`
      : `${period} 期末结转损益`

    // 年末结转分录要在生成损益结转凭证前算好：此时 3102 余额不含本期结转
    const yearEnd = await this.buildYearEnd(period, built.profitCents)

    const created = await this.vouchersService.create(
      {
        word: VoucherWord.GENERAl,
        voucherDate,
        entries: built.entries,
        remark: remark.slice(0, 200),
      },
      operator,
      true,
    )

    let yearEndVoucher: any = null
    if (yearEnd?.entries.length) {
      try {
        yearEndVoucher = await this.vouchersService.create(
          {
            word: VoucherWord.GENERAl,
            voucherDate,
            entries: yearEnd.entries,
            remark: `${Math.floor(period / 100)} 年度结转本年利润至未分配利润`.slice(0, 200),
          },
          operator,
          true,
        )
      } catch (e) {
        // 年末结转失败时回滚已生成的损益结转凭证，避免留下半套数据
        await this.vouchersService.unapprove(created.id)
        await this.vouchersService.remove(created.id)
        throw e
      }
    }

    // 打上来源标记，便于识别「已结转」与做反结转
    await this.voucherRepo.update(
      { id: created.id },
      { sourceType: VoucherSource.CLOSING, sourceId: String(period) },
    )
    if (yearEndVoucher) {
      await this.voucherRepo.update(
        { id: yearEndVoucher.id },
        { sourceType: VoucherSource.CLOSING, sourceId: String(period) },
      )
    }

    // 12 月结转完成后，把资产负债表余额结转到下一年期初
    let carryForward: { created: number; skipped: boolean } | undefined
    if (period % 100 === 12) {
      carryForward = await this.carryForwardNextYear(period)
    }

    const result = await this.preview({ period })
    if (result.yearEnd && carryForward) result.yearEnd.carryForward = carryForward
    return result
  }

  /** 取消结转：删除本期结转凭证（先反审核再删除） */
  async rollback(dto: ClosingQueryDto): Promise<{ message: string }> {
    const period = dto.period ?? currentPeriod()
    const existingList = await this.findClosingVouchers(period)
    if (!existingList.length) throw new NotFoundException('本期尚未结转')

    // 后期已结转时不允许撤回本期，否则后续期间余额会失真
    const laterClosed = await this.findLaterClosingPeriods(period)
    if (laterClosed.length) {
      throw new BadRequestException(
        `请先取消后期结转（${laterClosed.join('、')}），再取消本期结转`,
      )
    }

    // 12 月可能同时有损益结转和年末结转两张凭证，按倒序全部删除
    for (const voucher of existingList.sort((a, b) => b.voucherNo - a.voucherNo)) {
      if (voucher.status === VoucherStatus.APPROVED) {
        await this.vouchersService.unapprove(voucher.id, { allowClosing: true })
      }
      await this.vouchersService.remove(voucher.id, { allowClosing: true })
    }
    return { message: `${period} 期间结转已取消` }
  }

  // ==================== 内部 ====================

  /**
   * 汇总本期之前（含本期、不含本期结转凭证）的损益余额，并组装结转分录。
   */
  private async build(period: number): Promise<{
    rows: ProfitRow[]
    entries: VoucherEntryDto[]
    expenseCents: number
    revenueCents: number
    profitCents: number
    profitAccount: Account | null
  }> {
    const profitAccount = await this.accountRepo.findOne({ where: { code: PROFIT_ACCOUNT_CODE } })
    const accounts = await this.accountRepo.find({
      where: { category: AccountCategory.PROFIT },
      order: { code: 'ASC' },
    })
    const leafMap = new Map(accounts.filter((a) => a.isLeaf && a.status === 1).map((a) => [a.id, a]))
    if (!leafMap.size) {
      return { rows: [], entries: [], expenseCents: 0, revenueCents: 0, profitCents: 0, profitAccount }
    }

    const raw = await this.entryRepo
      .createQueryBuilder('e')
      .select('e.accountId', 'accountId')
      .addSelect('e.partnerId', 'partnerId')
      .addSelect('e.departmentId', 'departmentId')
      .addSelect('e.projectId', 'projectId')
      .addSelect('e.employeeId', 'employeeId')
      .addSelect('SUM(e.debit)', 'debit')
      .addSelect('SUM(e.credit)', 'credit')
      .innerJoin(
        Voucher,
        'v',
        'v.id = e.voucherId AND v.company_id = e.company_id AND v.period <= :period AND v.status = :status AND NOT (v.sourceType = :closingType AND v.sourceId = :closingId)',
        {
          period,
          status: VoucherStatus.APPROVED,
          closingType: VoucherSource.CLOSING,
          closingId: String(period),
        },
      )
      .groupBy('e.accountId')
      .addGroupBy('e.partnerId')
      .addGroupBy('e.departmentId')
      .addGroupBy('e.projectId')
      .addGroupBy('e.employeeId')
      .getRawMany<{
        accountId: string
        partnerId: string | null
        departmentId: string | null
        projectId: string | null
        employeeId: string | null
        debit: number | string | null
        credit: number | string | null
      }>()

    const names = await this.loadAuxNames(raw)

    const rows: ProfitRow[] = []
    const entries: VoucherEntryDto[] = []
    let expenseCents = 0
    let revenueCents = 0

    for (const r of raw) {
      const account = leafMap.get(r.accountId)
      if (!account) continue
      const net = toCents(r.debit ?? 0) - toCents(r.credit ?? 0)
      if (net === 0) continue

      const isDebitBalance = net > 0
      const cents = Math.abs(net)
      const aux = {
        partnerId: r.partnerId ?? undefined,
        departmentId: r.departmentId ?? undefined,
        projectId: r.projectId ?? undefined,
        employeeId: r.employeeId ?? undefined,
      }

      rows.push({
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        direction: isDebitBalance ? BalanceDirection.DEBIT : BalanceDirection.CREDIT,
        amount: fromCents(cents),
        closingDirection: isDebitBalance ? BalanceDirection.CREDIT : BalanceDirection.DEBIT,
        partnerId: r.partnerId ?? null,
        departmentId: r.departmentId ?? null,
        projectId: r.projectId ?? null,
        employeeId: r.employeeId ?? null,
        partnerName: r.partnerId ? (names.partner.get(r.partnerId) ?? null) : null,
        departmentName: r.departmentId ? (names.dept.get(r.departmentId) ?? null) : null,
        projectName: r.projectId ? (names.project.get(r.projectId) ?? null) : null,
        employeeName: r.employeeId ? (names.employee.get(r.employeeId) ?? null) : null,
      })

      // 借方余额（费用/支出）→ 贷该科目；贷方余额（收入）→ 借该科目
      if (isDebitBalance) {
        expenseCents += cents
        entries.push({
          summary: CLOSING_SUMMARY,
          accountId: account.id,
          ...aux,
          credit: fromCents(cents),
        })
      } else {
        revenueCents += cents
        entries.push({
          summary: CLOSING_SUMMARY,
          accountId: account.id,
          ...aux,
          debit: fromCents(cents),
        })
      }
    }

    // 本年利润：盈利记贷方，亏损记借方
    const profitCents = revenueCents - expenseCents
    if (profitCents !== 0 && profitAccount) {
      entries.push(
        profitCents > 0
          ? { summary: CLOSING_SUMMARY, accountId: profitAccount.id, credit: fromCents(profitCents) }
          : { summary: CLOSING_SUMMARY, accountId: profitAccount.id, debit: fromCents(-profitCents) },
      )
    }

    return { rows, entries, expenseCents, revenueCents, profitCents, profitAccount }
  }

  /**
   * 年末结转：把 3102 本年利润的累计余额转入 3103.01 未分配利润。
   * 只在 12 月生成；盈利时 借 3102 / 贷 3103.01，亏损时反向。
   */
  private async buildYearEnd(
    period: number,
    profitCents: number,
  ): Promise<{
    profitBalance: number
    direction: BalanceDirection
    entries: VoucherEntryDto[]
    undistributedAccount: { id: string; code: string; name: string } | null
  } | null> {
    if (period % 100 !== 12) return null

    const [profitAccount, undistributed] = await Promise.all([
      this.accountRepo.findOne({ where: { code: PROFIT_ACCOUNT_CODE } }),
      this.accountRepo.findOne({ where: { code: UNDISTRIBUTED_PROFIT_CODE } }),
    ])
    if (!profitAccount) return null
    if (!undistributed) {
      throw new BadRequestException(
        `未找到「未分配利润」科目（编码 ${UNDISTRIBUTED_PROFIT_CODE}），请先在会计科目中维护`,
      )
    }

    // 3102 在本次结转前的余额（排除本期结转凭证）
    const raw = await this.entryRepo
      .createQueryBuilder('e')
      .select('SUM(e.debit)', 'debit')
      .addSelect('SUM(e.credit)', 'credit')
      .innerJoin(
        Voucher,
        'v',
        'v.id = e.voucherId AND v.company_id = e.company_id AND v.period <= :period AND v.status = :status AND NOT (v.sourceType = :closingType AND v.sourceId = :closingId)',
        {
          period,
          status: VoucherStatus.APPROVED,
          closingType: VoucherSource.CLOSING,
          closingId: String(period),
        },
      )
      .where('e.accountId = :accountId', { accountId: profitAccount.id })
      .getRawOne<{ debit: number | string | null; credit: number | string | null }>()

    // 借方为正；利润结转会贷记 3102，所以减去 profitCents
    const netCents = toCents(raw?.debit ?? 0) - toCents(raw?.credit ?? 0) - profitCents
    const cents = Math.abs(netCents)
    if (cents === 0) {
      return {
        profitBalance: 0,
        direction: BalanceDirection.CREDIT,
        entries: [],
        undistributedAccount: {
          id: undistributed.id,
          code: undistributed.code,
          name: undistributed.name,
        },
      }
    }

    const entries: VoucherEntryDto[] =
      netCents < 0
        ? [
            { summary: YEAR_END_SUMMARY, accountId: profitAccount.id, debit: fromCents(cents) },
            { summary: YEAR_END_SUMMARY, accountId: undistributed.id, credit: fromCents(cents) },
          ]
        : [
            { summary: YEAR_END_SUMMARY, accountId: undistributed.id, debit: fromCents(cents) },
            { summary: YEAR_END_SUMMARY, accountId: profitAccount.id, credit: fromCents(cents) },
          ]

    return {
      profitBalance: fromCents(cents),
      direction: netCents < 0 ? BalanceDirection.CREDIT : BalanceDirection.DEBIT,
      entries,
      undistributedAccount: {
        id: undistributed.id,
        code: undistributed.code,
        name: undistributed.name,
      },
    }
  }

  /**
   * 年末结转后，把 12/31 的资产负债表科目余额结转到下一年期初。
   * 已存在下年期初时不覆盖，返回 skipped。
   */
  private async carryForwardNextYear(
    period: number,
  ): Promise<{ created: number; skipped: boolean }> {
    const year = Math.floor(period / 100)
    const nextYear = year + 1
    const yearStart = year * 100 + 1

    const existing = await this.initialBalanceRepo.count({ where: { fiscalYear: nextYear } })
    if (existing > 0) return { created: 0, skipped: true }

    const accounts = await this.accountRepo.find()
    const accountMap = new Map(accounts.map((a) => [a.id, a]))
    const balanceAccountIds = new Set(
      accounts.filter((a) => a.category !== AccountCategory.PROFIT).map((a) => a.id),
    )

    type CarryItem = {
      accountId: string
      partnerId: string | null
      departmentId: string | null
      projectId: string | null
      employeeId: string | null
      netCents: number
    }
    const totals = new Map<string, CarryItem>()
    const keyOf = (
      accountId: string,
      partnerId: string | null,
      departmentId: string | null,
      projectId: string | null,
      employeeId: string | null,
    ) => `${accountId}|${partnerId ?? ''}|${departmentId ?? ''}|${projectId ?? ''}|${employeeId ?? ''}`

    // 本年已有期初余额先计入（下一年期初 = 本年年初 + 本年发生）
    const currentOpenings = await this.initialBalanceRepo.find({ where: { fiscalYear: year } })
    for (const row of currentOpenings) {
      if (!balanceAccountIds.has(row.accountId)) continue
      const key = keyOf(row.accountId, row.partnerId, row.departmentId, row.projectId, row.employeeId)
      const item = totals.get(key) ?? {
        accountId: row.accountId,
        partnerId: row.partnerId,
        departmentId: row.departmentId,
        projectId: row.projectId,
        employeeId: row.employeeId,
        netCents: 0,
      }
      item.netCents +=
        row.direction === BalanceDirection.DEBIT ? toCents(row.amount) : -toCents(row.amount)
      totals.set(key, item)
    }

    // 本年已审核凭证发生额
    const rows = await this.entryRepo
      .createQueryBuilder('e')
      .select('e.accountId', 'accountId')
      .addSelect('e.partnerId', 'partnerId')
      .addSelect('e.departmentId', 'departmentId')
      .addSelect('e.projectId', 'projectId')
      .addSelect('e.employeeId', 'employeeId')
      .addSelect('SUM(e.debit)', 'debit')
      .addSelect('SUM(e.credit)', 'credit')
      .innerJoin(
        Voucher,
        'v',
        'v.id = e.voucherId AND v.company_id = e.company_id AND v.period >= :yearStart AND v.period <= :period AND v.status = :status',
        { yearStart, period, status: VoucherStatus.APPROVED },
      )
      .groupBy('e.accountId')
      .addGroupBy('e.partnerId')
      .addGroupBy('e.departmentId')
      .addGroupBy('e.projectId')
      .addGroupBy('e.employeeId')
      .getRawMany<{
        accountId: string
        partnerId: string | null
        departmentId: string | null
        projectId: string | null
        employeeId: string | null
        debit: number | string | null
        credit: number | string | null
      }>()

    for (const r of rows) {
      if (!balanceAccountIds.has(r.accountId)) continue
      const key = keyOf(r.accountId, r.partnerId, r.departmentId, r.projectId, r.employeeId)
      const item = totals.get(key) ?? {
        accountId: r.accountId,
        partnerId: r.partnerId,
        departmentId: r.departmentId,
        projectId: r.projectId,
        employeeId: r.employeeId,
        netCents: 0,
      }
      item.netCents += toCents(r.debit ?? 0) - toCents(r.credit ?? 0)
      totals.set(key, item)
    }

    const entities: InitialBalance[] = []
    for (const item of totals.values()) {
      if (item.netCents === 0) continue
      const account = accountMap.get(item.accountId)
      if (!account) continue
      entities.push(
        this.initialBalanceRepo.create({
          fiscalYear: nextYear,
          accountId: account.id,
          accountCode: account.code,
          accountName: account.name,
          partnerId: item.partnerId,
          departmentId: item.departmentId,
          projectId: item.projectId,
          employeeId: item.employeeId,
          direction: item.netCents > 0 ? BalanceDirection.DEBIT : BalanceDirection.CREDIT,
          amount: fromCents(Math.abs(item.netCents)),
          remark: `${year} 年末自动结转`,
        }),
      )
    }
    if (entities.length) await this.initialBalanceRepo.save(entities)
    return { created: entities.length, skipped: false }
  }

  /** 当前期间的结转凭证（未作废） */
  private async findClosingVoucher(period: number): Promise<Voucher | null> {
    const list = await this.findClosingVouchers(period)
    if (!list.length) return null
    return list.sort((a, b) => b.voucherNo - a.voucherNo)[0]
  }

  /** 当前期间的所有结转凭证（损益结转 + 年末结转），未作废 */
  private async findClosingVouchers(period: number): Promise<Voucher[]> {
    const list = await this.voucherRepo.find({ where: { sourceType: VoucherSource.CLOSING } })
    return list
      .filter((v) => v.sourceId === String(period) && v.status !== VoucherStatus.CANCELLED)
      .sort((a, b) => b.voucherNo - a.voucherNo)
  }

  /** 已结转且期间晚于 period 的期间列表 */
  private async findLaterClosingPeriods(period: number): Promise<number[]> {
    const list = await this.voucherRepo.find({ where: { sourceType: VoucherSource.CLOSING } })
    const periods = new Set<number>()
    for (const v of list) {
      if (v.status === VoucherStatus.CANCELLED) continue
      const p = Number(v.sourceId)
      if (Number.isInteger(p) && p > period) periods.add(p)
    }
    return Array.from(periods).sort()
  }

  private async loadAuxNames(
    rows: Array<{
      partnerId: string | null
      departmentId: string | null
      projectId: string | null
      employeeId: string | null
    }>,
  ): Promise<{
    partner: Map<string, string>
    dept: Map<string, string>
    project: Map<string, string>
    employee: Map<string, string>
  }> {
    const partnerIds = Array.from(new Set(rows.map((r) => r.partnerId).filter(Boolean) as string[]))
    const deptIds = Array.from(new Set(rows.map((r) => r.departmentId).filter(Boolean) as string[]))
    const projectIds = Array.from(new Set(rows.map((r) => r.projectId).filter(Boolean) as string[]))
    const employeeIds = Array.from(new Set(rows.map((r) => r.employeeId).filter(Boolean) as string[]))

    const [partners, depts, projects, employees] = await Promise.all([
      partnerIds.length ? this.partnerRepo.findBy({ id: In(partnerIds) }) : Promise.resolve([]),
      deptIds.length ? this.deptRepo.findBy({ id: In(deptIds) }) : Promise.resolve([]),
      projectIds.length ? this.projectRepo.findBy({ id: In(projectIds) }) : Promise.resolve([]),
      employeeIds.length ? this.employeeRepo.findBy({ id: In(employeeIds) }) : Promise.resolve([]),
    ])

    return {
      partner: new Map(partners.map((p: any) => [p.id, p.name])),
      dept: new Map(depts.map((d: any) => [d.id, d.name])),
      project: new Map(projects.map((p: any) => [p.id, p.name])),
      employee: new Map(employees.map((e: any) => [e.id, e.name])),
    }
  }
}
