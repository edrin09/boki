import { BadRequestException, Injectable } from '@nestjs/common'
import { Brackets, In } from 'typeorm'
import { Employee, Loan, EmployeeSettlement } from '../../entities/hr.entity'
import { Voucher } from '../../entities/voucher.entity'
import { LoanStatus, VoucherSource, VoucherStatus, VoucherWord } from '../../common/enums'
import { toCents } from '../../common/utils/money.util'
import { CompanyScopedRepository } from '../../common/company/company.repository'
import { InjectCompanyRepo } from '../../common/company/company-repo.decorator'
import { VouchersService } from '../vouchers/vouchers.service'
import type { VoucherEntryDto } from '../vouchers/dto/voucher.dto'
import type { Operator } from '../cash-bank/cash-bank.service'
import type { PageResult, PaginationQueryDto } from '../../common/dto/pagination.dto'

/** 现金/银行实际还款走 repaidAmount，其余（报销/发票/工资扣回）走 offsetAmount */
const CASH_LIKE_SETTLE_TYPES = new Set(['cash', 'bank'])

/** 借款核销入参 */
export interface SettleLoanInput {
  /** 核销途径 */
  settleType: 'cash' | 'bank' | 'expense_claim' | 'receipt' | 'payroll'
  /** 来源单据ID */
  sourceId: string
  /** 来源单据号（快照） */
  sourceNo?: string
  /** 抵充的借款单ID；为空表示员工垫付挂账，不抵扣任何借款单 */
  loanId?: string | null
  /** 核销金额（元） */
  amount: number
  /** 核销日期 YYYY-MM-DD */
  settleDate: string
  /** 摘要 */
  summary: string
  /** 借方分录（费用/资金/应付薪酬）；贷方 1221 由本服务解析并挂员工辅助核算 */
  debitEntry: VoucherEntryDto
  /** 其他应收款-员工 科目ID（1221），由 loans 模块解析后传入 */
  receivableAccountId: string
  /** 凭证备注 */
  remark?: string
}

/** 登记「已存在凭证」的核销（报销/采购发票/工资发放审核时已生成凭证，仅补登记流水并回写借款单） */
export interface RegisterExistingInput {
  settleType: 'cash' | 'bank' | 'expense_claim' | 'receipt' | 'payroll'
  sourceId: string
  sourceNo?: string
  /**
   * 抵充的借款单ID：
   * - 传入：核销该笔借款单（报销单等用户明确指定的场景）
   * - 不传：按借款日期先后（FIFO）自动分配到该员工所有未还清借款单，
   *   超出未还清总额的余额登记为无借款挂账流水（如工资扣回超过欠款）
   */
  loanId?: string | null
  employeeId: string
  amount: number
  settleDate: string
  summary: string
  voucherId?: string | null
  remark?: string
}

/**
 * 员工往来核销服务
 *
 * 统一处理「其他应收款-员工借款」的贷方核销。现金/银行还款、报销抵充、
 * 采购发票抵充、工资扣回都走这里，保证核销流水与借款单已清偿金额始终一致。
 *
 * 记账口径：
 * - cash/bank      实际收现 → 借款单 repaidAmount
 * - 其余途径        非现金抵充 → 借款单 offsetAmount
 * 借款总清偿 = repaidAmount + offsetAmount。
 */
@Injectable()
export class EmployeeSettlementService {
  constructor(
    @InjectCompanyRepo(EmployeeSettlement)
    private readonly repo: CompanyScopedRepository<EmployeeSettlement>,
    @InjectCompanyRepo(Loan) private readonly loanRepo: CompanyScopedRepository<Loan>,
    @InjectCompanyRepo(Employee) private readonly employeeRepo: CompanyScopedRepository<Employee>,
    @InjectCompanyRepo(Voucher) private readonly voucherRepo: CompanyScopedRepository<Voucher>,
    private readonly vouchersService: VouchersService,
  ) {}

  /**
   * 执行一笔借款核销：
   * 1. 校验借款单可抵充（未还清）
   * 2. 生成凭证（借方由调用方给，贷方固定 1221 且挂员工辅助核算）
   * 3. 登记核销流水（唯一键 settleType+sourceId 保证幂等）
   * 4. 回写借款单：现金/银行还款累加 repaidAmount，其余累加 offsetAmount
   */
  async settle(input: SettleLoanInput, operator: Operator): Promise<EmployeeSettlement> {
    const amountCents = toCents(input.amount)
    if (amountCents <= 0) {
      throw new BadRequestException('核销金额必须大于 0')
    }

    // 幂等：同一来源单据只允许核销一次
    const existed = await this.repo.findOne({
      where: { settleType: input.settleType, sourceId: input.sourceId },
    })
    if (existed) {
      throw new BadRequestException('该单据已完成借款核销，请勿重复操作')
    }

    let loan: Loan | null = null
    if (input.loanId) {
      loan = await this.loanRepo.findOne({ where: { id: input.loanId } })
      if (!loan) throw new BadRequestException('要抵充的借款单不存在')
      const outstanding = this.outstandingOf(loan)
      if (outstanding <= 0) {
        throw new BadRequestException(`借款单「${loan.loanNo}」已还清，无法继续抵充`)
      }
      if (amountCents > outstanding) {
        throw new BadRequestException(
          `抵充金额不能超过借款单「${loan.loanNo}」剩余未还金额 ${(outstanding / 100).toFixed(2)} 元`,
        )
      }
    }

    const employeeId = input.debitEntry.employeeId ?? loan?.employeeId
    if (!employeeId) {
      throw new BadRequestException('无法确定核销员工，请检查员工辅助核算')
    }

    // 贷方固定 1221（其他应收款-员工），挂员工辅助核算以便按员工拆分余额
    const creditEntry: VoucherEntryDto = {
      summary: input.summary,
      accountId: input.receivableAccountId,
      employeeId,
      credit: amountCents / 100,
    }

    const voucher = await this.vouchersService.createFromSystem(
      {
        word: VoucherWord.GENERAl,
        voucherDate: input.settleDate,
        entries: [input.debitEntry, creditEntry],
        remark: input.remark ?? `员工往来核销 ${input.sourceNo ?? input.sourceId}`,
        sourceType: VoucherSource.EMPLOYEE_SETTLEMENT,
        sourceId: input.sourceId,
        autoApprove: true,
      },
      operator,
    )

    const record = this.repo.create({
      settleType: input.settleType,
      sourceId: input.sourceId,
      sourceNo: input.sourceNo ?? null,
      employeeId,
      employeeName: await this.resolveEmployeeName(employeeId, loan?.employeeName),
      loanId: loan?.id ?? null,
      loanNo: loan?.loanNo ?? null,
      settleDate: input.settleDate,
      amount: amountCents / 100,
      summary: input.summary,
      voucherId: voucher.id,
      createdBy: operator.id,
      createdByName: operator.nickname,
      remark: input.remark ?? null,
    })
    const saved = await this.repo.save(record)

    if (loan) {
      await this.applyToLoan(loan, amountCents, input.settleType)
    }

    return saved
  }

  /**
   * 登记一笔「复用已有凭证」的核销：
   * 报销/采购发票/工资发放审核时已生成凭证（贷 1221），
   * 这里只补登记核销流水并回写借款单，不重复出账。
   *
   * loanId 为空时按 FIFO 自动分配到员工所有未还清借款单（可能产生多条流水）；
   * 分配完仍有余额时，余额登记为无借款挂账流水。
   */
  async registerExisting(
    input: RegisterExistingInput,
    operator: Operator,
  ): Promise<EmployeeSettlement | EmployeeSettlement[]> {
    const amountCents = toCents(input.amount)
    if (amountCents <= 0) {
      throw new BadRequestException('核销金额必须大于 0')
    }

    // 幂等：同一来源单据只登记一次
    const existed = await this.repo.findOne({
      where: { settleType: input.settleType, sourceId: input.sourceId },
    })
    if (existed) return existed

    const employeeName = await this.resolveEmployeeName(input.employeeId)

    // 显式指定借款单：单笔核销并校验余额
    if (input.loanId) {
      const loan = await this.loanRepo.findOne({ where: { id: input.loanId } })
      if (!loan) throw new BadRequestException('要抵充的借款单不存在')
      const outstanding = this.outstandingOf(loan)
      if (outstanding <= 0) {
        throw new BadRequestException(`借款单「${loan.loanNo}」已还清，无法继续抵充`)
      }
      if (amountCents > outstanding) {
        throw new BadRequestException(
          `抵充金额不能超过借款单「${loan.loanNo}」剩余未还金额 ${(outstanding / 100).toFixed(2)} 元`,
        )
      }
      return this.saveSettlement(input, employeeName, loan, amountCents, operator)
    }

    // FIFO：按借款日期先后自动分配（先借先还），直到金额分完
    const loans = await this.loanRepo.find({
      where: { employeeId: input.employeeId, status: In([LoanStatus.APPROVED, LoanStatus.REPAID]) },
      order: { loanDate: 'ASC' },
    })
    let remaining = amountCents
    const records: EmployeeSettlement[] = []
    for (const loan of loans) {
      if (remaining <= 0) break
      const outstanding = this.outstandingOf(loan)
      if (outstanding <= 0) continue
      const applied = Math.min(outstanding, remaining)
      records.push(await this.saveSettlement(input, employeeName, loan, applied, operator))
      remaining -= applied
    }
    // 员工没有未还清借款（纯垫付）或金额超出欠款总额：余额登记为无借款挂账流水
    if (remaining > 0) {
      records.push(await this.saveSettlement(input, employeeName, null, remaining, operator))
    }
    return records
  }

  /** 撤销来源单据的全部核销：回滚借款单 → 删凭证 → 删流水 */
  async cancelBySource(settleType: string, sourceId: string): Promise<void> {
    const records = await this.repo.find({ where: { settleType, sourceId } })
    if (!records.length) return

    for (const record of records) {
      if (record.loanId) {
        const loan = await this.loanRepo.findOne({ where: { id: record.loanId } })
        if (loan) {
          await this.rollbackLoan(loan, toCents(Number(record.amount)), record.settleType)
        }
      }
    }

    const voucherIds = [...new Set(records.map((r) => r.voucherId).filter(Boolean))] as string[]
    for (const voucherId of voucherIds) {
      const voucher = await this.voucherRepo.findOne({ where: { id: voucherId } })
      if (voucher) {
        if (voucher.status === VoucherStatus.APPROVED) {
          await this.vouchersService.unapprove(voucher.id)
        }
        await this.vouchersService.remove(voucher.id)
      }
    }

    await this.repo.delete({ id: In(records.map((r) => r.id)) } as any)
  }

  /**
   * 按员工汇总未还清借款余额（元）。
   * 仅统计已发放（已借款/已还清）的借款单，供工资单生成时自动预填「借款扣回」。
   */
  async outstandingMapByEmployees(employeeIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>()
    if (!employeeIds.length) return map
    const loans = await this.loanRepo.find({
      where: {
        employeeId: In(employeeIds),
        status: In([LoanStatus.APPROVED, LoanStatus.REPAID]),
      },
    })
    for (const loan of loans) {
      const outstanding = this.outstandingOf(loan)
      if (outstanding <= 0) continue
      map.set(loan.employeeId, (map.get(loan.employeeId) ?? 0) + outstanding)
    }
    return new Map(Array.from(map, ([id, cents]) => [id, cents / 100]))
  }

  /** 借款单剩余未清偿金额（分）：现金还款与非现金抵充都算已清偿 */
  outstandingOf(loan: Loan): number {
    return (
      toCents(Number(loan.amount)) -
      toCents(Number(loan.repaidAmount ?? 0)) -
      toCents(Number(loan.offsetAmount ?? 0))
    )
  }

  settleTypeLabel(type: string): string {
    return (
      {
        cash: '现金还款',
        bank: '银行还款',
        expense_claim: '报销抵充',
        receipt: '采购发票抵充',
        payroll: '工资扣回',
      }[type] ?? type
    )
  }

  /** 按员工汇总往来余额 */
  async employeeBalances(
    query: PaginationQueryDto & { keyword?: string },
  ): Promise<PageResult<any>> {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20

    const qb = this.loanRepo.createQueryBuilder('l')
    // 只有已发放（已借款/已还清）的借款单才形成员工往来余额；
    // 待审核/已驳回的借款单尚未出账，不计入
    qb.andWhere('l.status IN (:...statuses)', { statuses: [LoanStatus.APPROVED, LoanStatus.REPAID] })
    if (query.keyword) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('l.employeeName LIKE :kw', { kw: `%${query.keyword}%` })
            .orWhere('l.employeeId LIKE :kw', { kw: `%${query.keyword}%` })
        }),
      )
    }

    const loans = await qb.orderBy('l.loanDate', 'DESC').getMany()

    const map = new Map<string, any>()
    for (const l of loans) {
      const row =
        map.get(l.employeeId) ??
        {
          employeeId: l.employeeId,
          employeeName: l.employeeName,
          loanCount: 0,
          loanTotal: 0,
          repaidTotal: 0,
          offsetTotal: 0,
          balance: 0,
        }
      row.loanCount += 1
      row.loanTotal += toCents(Number(l.amount)) / 100
      row.repaidTotal += toCents(Number(l.repaidAmount ?? 0)) / 100
      row.offsetTotal += toCents(Number(l.offsetAmount ?? 0)) / 100
      map.set(l.employeeId, row)
    }
    for (const row of map.values()) {
      row.balance = Math.round((row.loanTotal - row.repaidTotal - row.offsetTotal) * 100) / 100
    }

    const all = Array.from(map.values()).sort((a, b) => b.balance - a.balance)
    const start = (page - 1) * pageSize
    return { list: all.slice(start, start + pageSize), total: all.length, page, pageSize }
  }

  /** 借款核销流水 */
  async settlements(
    query: PaginationQueryDto & { employeeId?: string; loanId?: string },
  ): Promise<PageResult<any>> {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const qb = this.repo.createQueryBuilder('s')

    if (query.employeeId) qb.andWhere('s.employeeId = :employeeId', { employeeId: query.employeeId })
    if (query.loanId) qb.andWhere('s.loanId = :loanId', { loanId: query.loanId })

    const [list, total] = await qb
      .orderBy('s.settleDate', 'DESC')
      .addOrderBy('s.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount()

    return {
      list: list.map((s) => ({
        id: s.id,
        settleType: s.settleType,
        settleTypeLabel: this.settleTypeLabel(s.settleType),
        sourceId: s.sourceId,
        sourceNo: s.sourceNo,
        employeeId: s.employeeId,
        employeeName: s.employeeName,
        loanId: s.loanId,
        loanNo: s.loanNo,
        settleDate: s.settleDate,
        amount: s.amount,
        summary: s.summary,
        voucherId: s.voucherId,
        createdByName: s.createdByName,
        createdAt: s.createdAt,
      })),
      total,
      page,
      pageSize,
    }
  }

  // ==================== 内部 ====================

  /** 落一条核销流水并回写借款单（金额单位：分） */
  private async saveSettlement(
    input: RegisterExistingInput,
    employeeName: string,
    loan: Loan | null,
    amountCents: number,
    operator: Operator,
  ): Promise<EmployeeSettlement> {
    const record = this.repo.create({
      settleType: input.settleType,
      sourceId: input.sourceId,
      sourceNo: input.sourceNo ?? null,
      employeeId: input.employeeId,
      employeeName,
      loanId: loan?.id ?? null,
      loanNo: loan?.loanNo ?? null,
      settleDate: input.settleDate,
      amount: amountCents / 100,
      summary: loan ? `${input.summary}（抵充 ${loan.loanNo}）` : input.summary,
      voucherId: input.voucherId ?? null,
      createdBy: operator.id,
      createdByName: operator.nickname,
      remark: input.remark ?? null,
    })
    const saved = await this.repo.save(record)

    if (loan) {
      await this.applyToLoan(loan, amountCents, input.settleType)
    }
    return saved
  }

  /** 员工姓名：优先借款单快照，其次查员工档案，查不到兜底空串 */
  private async resolveEmployeeName(employeeId: string, snapshot?: string | null): Promise<string> {
    if (snapshot) return snapshot
    const employee = await this.employeeRepo.findOne({ where: { id: employeeId } })
    return employee?.name ?? ''
  }

  /** 核销后回写借款单：现金/银行还款累加 repaidAmount，其余累加 offsetAmount；还清则置「已还款」 */
  private async applyToLoan(loan: Loan, amountCents: number, settleType: string): Promise<void> {
    if (CASH_LIKE_SETTLE_TYPES.has(settleType)) {
      const repaidTotal = toCents(Number(loan.repaidAmount ?? 0)) + amountCents
      loan.repaidAmount = repaidTotal / 100
    } else {
      const offsetTotal = toCents(Number(loan.offsetAmount ?? 0)) + amountCents
      loan.offsetAmount = offsetTotal / 100
    }
    if (this.outstandingOf(loan) <= 0 && loan.status === LoanStatus.APPROVED) {
      loan.status = LoanStatus.REPAID
      loan.repaidAt = new Date()
    }
    await this.loanRepo.save(loan)
  }

  /** 撤销后回滚借款单已清偿金额（方向与核销途径一致），未还清则恢复「已借款」 */
  private async rollbackLoan(loan: Loan, amountCents: number, settleType: string): Promise<void> {
    if (CASH_LIKE_SETTLE_TYPES.has(settleType)) {
      const repaidTotal = Math.max(0, toCents(Number(loan.repaidAmount ?? 0)) - amountCents)
      loan.repaidAmount = repaidTotal / 100
    } else {
      const offsetTotal = Math.max(0, toCents(Number(loan.offsetAmount ?? 0)) - amountCents)
      loan.offsetAmount = offsetTotal / 100
    }
    if (loan.status === LoanStatus.REPAID && this.outstandingOf(loan) > 0) {
      loan.status = LoanStatus.APPROVED
      loan.repaidAt = null
    }
    await this.loanRepo.save(loan)
  }
}
