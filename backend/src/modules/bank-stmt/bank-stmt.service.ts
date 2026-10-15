import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { BankStmtRow, BankStmtStatus } from '../../entities/business.entity'
import { Account } from '../../entities/account.entity'
import { BankAccount } from '../../entities/bank-account.entity'
import { Loan, Employee } from '../../entities/hr.entity'
import { Partner } from '../../entities/partner.entity'
import { CompanyScopedRepository } from '../../common/company/company.repository'
import { InjectCompanyRepo } from '../../common/company/company-repo.decorator'
import { CashBankService } from '../cash-bank/cash-bank.service'
import type { Operator } from '../cash-bank/cash-bank.service'
export type { Operator }
import { parseStatement, StmtRow } from './stmt-parser'
import type { PageResult, PaginationQueryDto } from '../../common/dto/pagination.dto'

/** 常用科目编码 */
const CODE = {
  INTEREST_INCOME: '6701.02', // 财务费用-利息收入
  BANK_FEE: '6701.03', // 财务费用-手续费
  RECEIVABLE: '1122', // 应收账款
  EMPLOYEE_RECEIVABLE: '1221', // 其他应收款（员工往来）
  OTHER_PAYABLE: '2241', // 其他应付款（收入行默认建议：暂挂往来，确认性质后再调）
  ADMIN_EXPENSE: '6602', // 管理费用（支出行默认建议）
}

const INTEREST_RE = /利息|结息/
const FEE_RE = /手续费|工本费|年费|汇费|短信费|网银|服务费|账户费/

@Injectable()
export class BankStmtService {
  constructor(
    @InjectCompanyRepo(BankStmtRow) private readonly repo: CompanyScopedRepository<BankStmtRow>,
    @InjectCompanyRepo(Account) private readonly accountRepo: CompanyScopedRepository<Account>,
    @InjectCompanyRepo(BankAccount) private readonly bankRepo: CompanyScopedRepository<BankAccount>,
    @InjectCompanyRepo(Partner) private readonly partnerRepo: CompanyScopedRepository<Partner>,
    @InjectCompanyRepo(Loan) private readonly loanRepo: CompanyScopedRepository<Loan>,
    @InjectCompanyRepo(Employee) private readonly employeeRepo: CompanyScopedRepository<Employee>,
    private readonly cashBankService: CashBankService,
  ) {}

  // ==================== 导入 ====================

  /** 解析对账单文件并落库，逐行自动匹配 */
  async import(
    file: { buffer: Buffer; originalName: string },
    bankAccountId: string,
    operator: Operator,
  ): Promise<any> {
    const bank = await this.bankRepo.findOne({ where: { id: bankAccountId } })
    if (!bank) throw new BadRequestException('资金账户不存在')

    const rows = parseStatement(file.buffer, file.originalName)
    if (!rows.length) throw new BadRequestException('未解析出有效流水行，请确认文件内容')

    const batchId = randomUUID().slice(0, 8) + Date.now().toString(36)
    const ctx = await this.loadMatchContext()

    const entities = rows.map((r) => this.buildRow(r, batchId, bank.id, ctx))
    const saved = await this.repo.save(entities)

    const count = (s: string) => saved.filter((r) => r.status === s).length
    return {
      batchId,
      total: saved.length,
      booked: count(BankStmtStatus.BOOKED),
      matched: count(BankStmtStatus.MATCHED),
      pending: count(BankStmtStatus.PENDING),
      debitTotal: round2(saved.reduce((a, r) => a + r.debit, 0)),
      creditTotal: round2(saved.reduce((a, r) => a + r.credit, 0)),
      bankAccountName: bank.name,
    }
  }

  // ==================== 查询 ====================

  async findAll(query: PaginationQueryDto & { status?: string; batchId?: string; startDate?: string; endDate?: string }): Promise<PageResult<any>> {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 50
    const qb = this.repo.createQueryBuilder('r')
    if (query.status) qb.andWhere('r.status = :status', { status: query.status })
    if (query.batchId) qb.andWhere('r.batchId = :batchId', { batchId: query.batchId })
    if (query.startDate) qb.andWhere('r.rowDate >= :startDate', { startDate: query.startDate })
    if (query.endDate) qb.andWhere('r.rowDate <= :endDate', { endDate: query.endDate })
    if (query.keyword) {
      qb.andWhere('(r.summary LIKE :kw OR r.counterName LIKE :kw OR r.flowNo LIKE :kw)', {
        kw: `%${query.keyword}%`,
      })
    }
    const [list, total] = await qb
      .orderBy('r.rowDate', 'ASC')
      .addOrderBy('r.createdAt', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount()
    return { list, total, page, pageSize }
  }

  /** 汇总：各状态计数 + 借贷合计 */
  async summary(): Promise<any> {
    const rows = await this.repo.find()
    const pick = (s: string) => rows.filter((r) => r.status === s)
    return {
      total: rows.length,
      booked: pick(BankStmtStatus.BOOKED).length,
      matched: pick(BankStmtStatus.MATCHED).length,
      pending: pick(BankStmtStatus.PENDING).length,
      skipped: pick(BankStmtStatus.SKIPPED).length,
      debitTotal: round2(rows.reduce((a, r) => a + r.debit, 0)),
      creditTotal: round2(rows.reduce((a, r) => a + r.credit, 0)),
      pendingDebit: round2(pick(BankStmtStatus.PENDING).reduce((a, r) => a + r.debit, 0)),
      pendingCredit: round2(pick(BankStmtStatus.PENDING).reduce((a, r) => a + r.credit, 0)),
    }
  }

  // ==================== 入账 / 状态操作 ====================

  /** 待确认行入账：复用现金银行单据链路自动生成凭证 */
  async book(
    id: string,
    dto: { bizType: string; accountId: string; partnerId?: string; summary?: string },
    operator: Operator,
  ): Promise<any> {
    const row = await this.mustFind(id)
    if (row.status !== BankStmtStatus.PENDING) {
      throw new BadRequestException('只有「待确认」状态的流水行可以入账')
    }
    const amount = row.debit > 0 ? row.debit : row.credit
    if (amount <= 0) throw new BadRequestException('流水行金额异常')
    if (dto.bizType === 'transfer') throw new BadRequestException('流水行入账不支持内部转账，请到现金银行手动录入')

    const cashFlow = await this.cashBankService.create(
      {
        bizType: dto.bizType as any,
        bizDate: row.rowDate,
        bankAccountId: row.bankAccountId,
        accountId: dto.accountId,
        partnerId: dto.partnerId || row.suggestPartnerId || null,
        amount,
        summary: (dto.summary || row.summary || row.counterName || '银行流水').slice(0, 180),
        remark: row.flowNo ? `银行流水 ${row.flowNo}` : null,
      },
      operator,
      true,
    )

    row.status = BankStmtStatus.BOOKED
    row.cashFlowId = cashFlow.id
    row.voucherId = cashFlow.voucherId
    row.matchInfo = `已入账（${labelOf(dto.bizType)}）`
    row.remark = row.flowNo ? `银行流水 ${row.flowNo}` : row.remark
    await this.repo.save(row)
    return this.toVo(row)
  }

  /** 标记跳过：该行已在其他模块记账或无需记账 */
  async skip(id: string, remark?: string): Promise<any> {
    const row = await this.mustFind(id)
    if (row.status === BankStmtStatus.BOOKED) throw new BadRequestException('已入账的流水行不能跳过，请先删除对应资金单据')
    row.status = BankStmtStatus.SKIPPED
    row.matchInfo = remark || row.matchInfo || '已跳过'
    if (remark) row.remark = remark
    await this.repo.save(row)
    return this.toVo(row)
  }

  /** 撤销跳过/取消匹配，回到待确认 */
  async restore(id: string): Promise<any> {
    const row = await this.mustFind(id)
    if (row.status === BankStmtStatus.BOOKED) throw new BadRequestException('已入账的流水行不能恢复')
    row.status = BankStmtStatus.PENDING
    row.matchInfo = '人工恢复为待确认'
    await this.repo.save(row)
    return this.toVo(row)
  }

  /** 删除流水行（已入账的联动删除资金单据与凭证） */
  async remove(id: string, operator: Operator): Promise<{ message: string }> {
    const row = await this.mustFind(id)
    if (row.cashFlowId) {
      await this.cashBankService.remove(row.cashFlowId, operator)
    }
    await this.repo.delete({ id } as any)
    return { message: '删除成功' }
  }

  /** 按批次删除（未入账的行） */
  async removeBatch(batchId: string, operator: Operator): Promise<{ message: string }> {
    const rows = await this.repo.find({ where: { batchId } })
    if (!rows.length) throw new NotFoundException('批次不存在')
    const booked = rows.filter((r) => r.status === BankStmtStatus.BOOKED)
    if (booked.length) {
      throw new BadRequestException(`批次内有 ${booked.length} 行已入账，请先在列表中删除已入账行`)
    }
    await this.repo.delete({ batchId } as any)
    void operator
    return { message: `已删除 ${rows.length} 行流水` }
  }

  // ==================== 匹配逻辑 ====================

  private async loadMatchContext(): Promise<MatchContext> {
    const accounts = new Map<string, Account>()
    for (const code of Object.values(CODE)) {
      const acc = await this.accountRepo.findOne({ where: { code } })
      if (acc) accounts.set(code, acc)
    }
    const partners = await this.partnerRepo.find()
    const loans = await this.loanRepo.find({ where: { status: 'approved' as any } })
    const employees = await this.employeeRepo.find()
    return { accounts, partners, loans, employees }
  }

  /** 逐行匹配。规则按优先级：利息/手续费 → 借款单 → 员工往来 → 往来单位 → 待确认 */
  private buildRow(r: StmtRow, batchId: string, bankAccountId: string, ctx: MatchContext): BankStmtRow {
    const row = this.repo.create({
      batchId,
      bankAccountId,
      rowDate: r.rowDate,
      summary: r.summary ?? '',
      counterName: r.counterName,
      counterAccount: r.counterAccount,
      flowNo: r.flowNo,
      debit: r.debit,
      credit: r.credit,
      balance: r.balance,
      status: BankStmtStatus.PENDING,
      matchInfo: '',
      suggestBizType: null,
      suggestAccountId: null,
      suggestAccountCode: null,
      suggestAccountName: null,
      remark: r.flowNo ? `银行流水 ${r.flowNo}` : null,
    })

    const text = `${r.summary ?? ''} ${r.counterName ?? ''}`
    const isInflow = r.credit > 0

    // 1) 利息收入 / 银行手续费：模式固定，直接给建议
    if (isInflow && INTEREST_RE.test(text)) {
      this.suggest(row, 'income', ctx.accounts.get(CODE.INTEREST_INCOME), '识别为存款利息')
      return row
    }
    if (!isInflow && FEE_RE.test(text)) {
      this.suggest(row, 'payment', ctx.accounts.get(CODE.BANK_FEE), '识别为银行手续费')
      return row
    }

    // 2) 支出匹配已审核借款单（金额相等 + 日期±1天 + 员工名命中）→ 已有凭证，不重复记账
    if (!isInflow) {
      const hit = this.matchLoan(r, ctx)
      if (hit) {
        row.status = BankStmtStatus.MATCHED
        row.matchInfo = `匹配借款单 ${hit}（已生成凭证，无需重复记账）`
        return row
      }
    }

    // 3) 对私转账：对方户名命中员工档案 → 挂员工往来（其他应收款）待核实，避免误计费用/收入
    if (r.counterName) {
      const emp = this.matchEmployee(r.counterName, ctx.employees)
      if (emp) {
        this.suggest(
          row,
          isInflow ? 'receipt' : 'payment',
          ctx.accounts.get(CODE.EMPLOYEE_RECEIVABLE),
          `对方户名为员工「${emp.name}」，建议挂员工往来（其他应收款）待核实`,
        )
        return row
      }
    }

    // 4) 收入匹配往来单位 → 收款冲应收
    if (isInflow && r.counterName) {
      const partner = this.matchPartner(r.counterName, ctx.partners)
      if (partner) {
        row.suggestPartnerId = partner.id
        this.suggest(row, 'receipt', ctx.accounts.get(CODE.RECEIVABLE), `识别为「${partner.name}」回款，建议冲应收账款`)
        return row
      }
    }

    // 5) 其余：待确认 + 保守建议（收入挂往来、支出挂管理费用，由用户确认后入账）
    row.matchInfo = isInflow ? '未识别收款性质，请确认对方科目' : '未识别支出性质，请确认费用科目'
    this.suggest(
      row,
      isInflow ? 'income' : 'expense',
      ctx.accounts.get(isInflow ? CODE.OTHER_PAYABLE : CODE.ADMIN_EXPENSE),
      null,
    )
    return row
  }

  private matchLoan(r: StmtRow, ctx: MatchContext): string | null {
    const cents = toCents(r.debit)
    const t = Date.parse(r.rowDate)
    for (const loan of ctx.loans) {
      if (toCents(Number(loan.amount)) !== cents) continue
      const ld = loan.loanDate ? Date.parse(String(loan.loanDate)) : NaN
      if (isNaN(ld) || Math.abs(ld - t) > 36 * 3600 * 1000) continue
      if (loan.employeeName && (r.counterName ?? '').includes(loan.employeeName)) return loan.loanNo
    }
    return null
  }

  private matchPartner(counterName: string, partners: Partner[]): Partner | null {
    const a = clean(counterName)
    if (a.length < 4) return null
    for (const p of partners) {
      const b = clean(p.name)
      if (b.length >= 4 && (a.includes(b) || b.includes(a))) return p
    }
    return null
  }

  /** 对方户名命中员工姓名（全等或包含，姓名至少2字） */
  private matchEmployee(counterName: string, employees: Employee[]): Employee | null {
    const a = clean(counterName)
    if (a.length < 2) return null
    for (const e of employees) {
      const b = clean(e.name)
      if (b.length >= 2 && (a === b || a.includes(b))) return e
    }
    return null
  }

  private suggest(row: BankStmtRow, bizType: string, account: Account | undefined, info: string | null): void {
    row.suggestBizType = bizType
    if (account) {
      row.suggestAccountId = account.id
      row.suggestAccountCode = account.code
      row.suggestAccountName = account.name
    }
    if (info) row.matchInfo = info
  }

  private async mustFind(id: string): Promise<BankStmtRow> {
    const row = await this.repo.findOne({ where: { id } })
    if (!row) throw new NotFoundException('流水行不存在')
    return row
  }

  private toVo(row: BankStmtRow): any {
    return { ...row }
  }
}

type MatchContext = {
  accounts: Map<string, Account>
  partners: Partner[]
  loans: Loan[]
  employees: Employee[]
}

function labelOf(bizType: string): string {
  const map: Record<string, string> = { receipt: '收款', payment: '付款', expense: '费用支出', income: '其他收入' }
  return map[bizType] ?? bizType
}

function clean(s: string): string {
  return (s ?? '').replace(/[\s（）()\-—_]/g, '')
}

function toCents(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100)
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
