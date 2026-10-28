import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Brackets, In } from 'typeorm'
import { Loan } from '@core/entities/hr.entity'
import { Employee } from '@core/entities/hr.entity'
import { Department } from '@core/entities/department.entity'
import { Account } from '@core/entities/account.entity'
import { BankAccount } from '@core/entities/bank-account.entity'
import { Voucher } from '@core/entities/voucher.entity'
import {
  LoanPayMethod,
  LoanStatus,
  VoucherSource,
  VoucherStatus,
  VoucherWord,
} from '@core/common/enums'
import { toCents } from '@core/common/utils/money.util'
import { CompanyScopedRepository } from '@core/common/company/company.repository'
import { InjectCompanyRepo } from '@core/common/company/company-repo.decorator'
import { VouchersService } from '@core/modules/vouchers/vouchers.service'
import { EmployeeSettlementService } from './employee-settlement.service'
import type { VoucherEntryDto } from '@core/modules/vouchers/dto/voucher.dto'
import type { Operator } from '@core/common/types/operator'
import type { PageResult, PaginationQueryDto } from '@core/common/dto/pagination.dto'
import type { HrPdfPackageDto } from '@core/common/dto/pdf-package.dto'
import type { RepayLoanDto, SaveLoanDto } from './dto/loan.dto'

/** 其他应收款-员工借款 科目编码 */
const DEFAULT_RECEIVABLE_CODE = '1221'
/** 库存现金 */
const DEFAULT_CASH_CODE = '1001'
/** 银行存款 */
const DEFAULT_BANK_CODE = '1002'

@Injectable()
export class LoansService {
  constructor(
    @InjectCompanyRepo(Loan) private readonly repo: CompanyScopedRepository<Loan>,
    @InjectCompanyRepo(Employee) private readonly employeeRepo: CompanyScopedRepository<Employee>,
    @InjectCompanyRepo(Department) private readonly deptRepo: CompanyScopedRepository<Department>,
    @InjectCompanyRepo(Account) private readonly accountRepo: CompanyScopedRepository<Account>,
    @InjectCompanyRepo(BankAccount) private readonly bankRepo: CompanyScopedRepository<BankAccount>,
    @InjectCompanyRepo(Voucher) private readonly voucherRepo: CompanyScopedRepository<Voucher>,
    private readonly vouchersService: VouchersService,
    private readonly settlementService: EmployeeSettlementService,
  ) {}

  // ==================== 查询 ====================

  async findAll(
    query: PaginationQueryDto & {
      status?: string
      employeeId?: string
      startDate?: string
      endDate?: string
    },
  ): Promise<PageResult<any>> {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const qb = this.repo.createQueryBuilder('l')

    if (query.status) qb.andWhere('l.status = :status', { status: query.status })
    if (query.employeeId) qb.andWhere('l.employeeId = :employeeId', { employeeId: query.employeeId })
    if (query.startDate) qb.andWhere('l.loanDate >= :startDate', { startDate: query.startDate })
    if (query.endDate) qb.andWhere('l.loanDate <= :endDate', { endDate: query.endDate })
    if (query.keyword) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('l.loanNo LIKE :kw', { kw: `%${query.keyword}%` })
            .orWhere('l.employeeName LIKE :kw', { kw: `%${query.keyword}%` })
            .orWhere('l.reason LIKE :kw', { kw: `%${query.keyword}%` })
            .orWhere('l.remark LIKE :kw', { kw: `%${query.keyword}%` })
        }),
      )
    }

    const [list, total] = await qb
      .orderBy('l.loanDate', 'DESC')
      .addOrderBy('l.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount()

    return { list: list.map((l) => this.toVo(l)), total, page, pageSize }
  }

  async findOne(id: string): Promise<any> {
    const loan = await this.repo.findOne({ where: { id } })
    if (!loan) throw new NotFoundException('借款单不存在')
    return this.toVo(loan)
  }

  /**
   * 批量导出 PDF（原始凭证存根）用：按 ids 或筛选条件取借款单，最多 300 张
   */
  async findForPdfExport(dto: HrPdfPackageDto): Promise<Loan[]> {
    const MAX = 300
    if (dto.ids?.length) {
      const loans = await this.repo.find({ where: { id: In(dto.ids.slice(0, MAX)) } })
      loans.sort((a, b) =>
        a.loanDate < b.loanDate ? -1 : a.loanDate > b.loanDate ? 1 : a.loanNo < b.loanNo ? -1 : 1,
      )
      return loans
    }
    const qb = this.repo.createQueryBuilder('l')
    if (dto.status) qb.andWhere('l.status = :status', { status: dto.status })
    if (dto.employeeId) qb.andWhere('l.employeeId = :employeeId', { employeeId: dto.employeeId })
    if (dto.startDate) qb.andWhere('l.loanDate >= :startDate', { startDate: dto.startDate })
    if (dto.endDate) qb.andWhere('l.loanDate <= :endDate', { endDate: dto.endDate })
    return qb
      .orderBy('l.loanDate', 'ASC')
      .addOrderBy('l.loanNo', 'ASC')
      .take(MAX)
      .getMany()
  }

  /** 下一个借款单号 */
  async getNextLoanNo(date: string): Promise<string> {
    const year = date.slice(0, 4).replace(/^0+/, '') || date.slice(0, 4)
    const prefix = `JK${year}`
    const max = await this.repo
      .createQueryBuilder('l')
      .select('MAX(l.loanNo)', 'max')
      .where('l.loanNo LIKE :prefix', { prefix: `${prefix}%` })
      .getRawOne<{ max: string | null }>()
    const last = max?.max ?? `${prefix}000`
    const seq = parseInt(last.slice(prefix.length), 10) + 1 || 1
    return `${prefix}${String(seq).padStart(4, '0')}`
  }

  // ==================== 写入 ====================

  async create(dto: SaveLoanDto, operator: Operator): Promise<any> {
    const context = await this.resolveContext(dto)

    // 单号：优先使用外部单号（导入/手工指定），为空或已占用时自动生成
    let loanNo = (dto.loanNo ?? '').trim()
    if (loanNo) {
      const exists = await this.repo.findOne({ where: { loanNo } })
      if (exists) loanNo = ''
    }
    if (!loanNo) loanNo = await this.getNextLoanNo(dto.loanDate)

    const entity = this.repo.create({
      loanNo,
      loanDate: dto.loanDate.slice(0, 10),
      employeeId: context.employee.id,
      employeeName: context.employee.name,
      departmentId: context.employee.departmentId,
      departmentName: context.departmentName,
      amount: dto.amount,
      reason: dto.reason ?? null,
      payMethod: dto.payMethod,
      bankAccountId: context.bankAccount?.id ?? null,
      bankAccountName: context.bankAccount?.name ?? null,
      status: LoanStatus.DRAFT,
      voucherId: null,
      repayVoucherId: null,
      createdBy: operator.id,
      createdByName: operator.nickname,
      remark: dto.remark ?? null,
    })

    const saved = await this.repo.save(entity)
    return this.findOne(saved.id)
  }

  async update(id: string, dto: SaveLoanDto, operator: Operator): Promise<any> {
    const loan = await this.findEntity(id)
    void operator
    this.assertDraft(loan, '编辑')

    const context = await this.resolveContext(dto)

    loan.loanDate = dto.loanDate.slice(0, 10)
    loan.employeeId = context.employee.id
    loan.employeeName = context.employee.name
    loan.departmentId = context.employee.departmentId
    loan.departmentName = context.departmentName
    loan.amount = dto.amount
    loan.reason = dto.reason ?? loan.reason
    loan.payMethod = dto.payMethod
    loan.bankAccountId = context.bankAccount?.id ?? null
    loan.bankAccountName = context.bankAccount?.name ?? null
    loan.remark = dto.remark ?? loan.remark

    await this.repo.save(loan)
    return this.findOne(id)
  }

  /** 审核：发放借款，生成借款凭证 */
  async approve(id: string, operator: Operator): Promise<any> {
    const loan = await this.findEntity(id)
    this.assertDraft(loan, '审核')

    const receivableAccount = await this.requireAccount(DEFAULT_RECEIVABLE_CODE)
    const payAccount = await this.resolvePayAccount(loan)

    const summary = `${loan.employeeName}借款`
    const entries: VoucherEntryDto[] = [
      { summary, accountId: receivableAccount.id, employeeId: loan.employeeId, debit: Number(loan.amount) },
      { summary, accountId: payAccount.id, credit: Number(loan.amount) },
    ]

    const voucher = await this.vouchersService.createFromSystem(
      {
        word: VoucherWord.GENERAl,
        voucherDate: loan.loanDate,
        entries,
        remark: `借款单 ${loan.loanNo}`,
        sourceType: VoucherSource.LOAN,
        sourceId: id,
        autoApprove: true,
      },
      operator,
    )

    loan.status = LoanStatus.APPROVED
    loan.voucherId = voucher.id
    loan.approvedAt = new Date()
    await this.repo.save(loan)

    return this.findOne(id)
  }

  /** 还款：支持部分还款，多次还款累计，还清后状态变为「已还款」 */
  async repay(id: string, dto: RepayLoanDto, operator: Operator): Promise<any> {
    const loan = await this.findEntity(id)
    if (loan.status !== LoanStatus.APPROVED) {
      throw new BadRequestException('仅「已借款」状态的借款单可以还款')
    }

    const outstanding = this.settlementService.outstandingOf(loan)
    if (outstanding <= 0) {
      throw new BadRequestException('该借款单已还清，无需再次还款')
    }

    // 还款金额：缺省 = 剩余欠款全额；超出剩余欠款则拒绝
    const repayAmount = dto.amount != null ? toCents(dto.amount) : outstanding
    if (repayAmount > outstanding) {
      throw new BadRequestException(
        `还款金额不能超过剩余欠款 ${(outstanding / 100).toFixed(2)} 元`,
      )
    }

    const receivableAccount = await this.requireAccount(DEFAULT_RECEIVABLE_CODE)
    const repayAccount = await this.resolveRepayAccount(dto)

    const summary = `${loan.employeeName}归还借款`
    const amountYuan = repayAmount / 100
    const settleDate = dto.repayDate ? dto.repayDate.slice(0, 10) : new Date().toISOString().slice(0, 10)

    const settlement = await this.settlementService.settle(
      {
        settleType: dto.repayMethod,
        sourceId: id,
        sourceNo: loan.loanNo,
        loanId: loan.id,
        amount: amountYuan,
        settleDate,
        summary,
        remark: dto.remark ?? `借款单 ${loan.loanNo} 还款`,
        // 现金/银行还款：借方为资金科目，贷方 1221（由服务挂员工辅助核算）
        debitEntry: {
          summary,
          accountId: repayAccount.id,
          employeeId: loan.employeeId,
          debit: amountYuan,
        },
        receivableAccountId: receivableAccount.id,
      },
      operator,
    )

    // repaidAmount / 状态已由核销服务回写，这里重载后只补还款凭证与日期，
    // 避免用过期实体把核销服务刚写入的金额覆盖回去
    const fresh = await this.findEntity(id)
    fresh.repayVoucherId = settlement.voucherId
    fresh.repayDate = settleDate
    await this.repo.save(fresh)

    return this.findOne(id)
  }

  /** 驳回 */
  async reject(id: string, reason: string): Promise<any> {
    const loan = await this.findEntity(id)
    this.assertDraft(loan, '驳回')

    loan.status = LoanStatus.REJECTED
    loan.remark = `驳回原因：${reason}`
    await this.repo.save(loan)
    return this.findOne(id)
  }

  async remove(id: string): Promise<{ message: string }> {
    const loan = await this.findEntity(id)
    if (loan.status === LoanStatus.REPAID) {
      throw new BadRequestException('已还款的借款单不可删除')
    }
    // 部分还款过的借款单已有还款凭证，删除会造成凭证悬挂
    if (toCents(Number(loan.repaidAmount ?? 0)) > 0) {
      throw new BadRequestException('该借款单已有还款记录，不可删除')
    }

    // 已审核未还款：先撤销借款凭证
    if (loan.voucherId) {
      const voucher = await this.voucherRepo.findOne({ where: { id: loan.voucherId } })
      if (voucher) {
        if (voucher.status === VoucherStatus.APPROVED) {
          await this.vouchersService.unapprove(voucher.id)
        }
        await this.vouchersService.remove(voucher.id)
      }
    }

    await this.repo.delete({ id } as any)
    return { message: '删除成功' }
  }

  // ==================== 内部 ====================

  private async findEntity(id: string): Promise<Loan> {
    const loan = await this.repo.findOne({ where: { id } })
    if (!loan) throw new NotFoundException('借款单不存在')
    return loan
  }

  private assertDraft(loan: Loan, action: string): void {
    if (loan.status !== LoanStatus.DRAFT) {
      throw new BadRequestException(`当前状态为「${this.statusLabel(loan.status)}」，不可${action}`)
    }
  }

  private async resolveContext(dto: SaveLoanDto): Promise<{
    employee: Employee
    departmentName: string | null
    bankAccount: BankAccount | null
  }> {
    const employee = await this.employeeRepo.findOne({ where: { id: dto.employeeId } })
    if (!employee) throw new BadRequestException('员工不存在')
    if (employee.status !== 1) throw new BadRequestException('该员工已离职，无法办理借款')

    if (toCents(dto.amount) <= 0) throw new BadRequestException('借款金额必须大于 0')

    let departmentName: string | null = null
    if (employee.departmentId) {
      const dept = await this.deptRepo.findOne({ where: { id: employee.departmentId } })
      departmentName = dept?.name ?? null
    }

    let bankAccount: BankAccount | null = null
    if (dto.bankAccountId) {
      bankAccount = await this.bankRepo.findOne({ where: { id: dto.bankAccountId } })
      if (!bankAccount) throw new BadRequestException('放款资金账户不存在')
    }

    return { employee, departmentName, bankAccount }
  }

  /** 解析借款放款的资金科目 */
  private async resolvePayAccount(loan: Loan): Promise<Account> {
    if (loan.bankAccountId) {
      const bank = await this.bankRepo.findOne({ where: { id: loan.bankAccountId } })
      if (!bank) throw new BadRequestException('放款资金账户不存在')
      return this.resolveAccountOfBank(bank)
    }
    const code = loan.payMethod === LoanPayMethod.CASH ? DEFAULT_CASH_CODE : DEFAULT_BANK_CODE
    return this.requireAccount(code)
  }

  /** 解析还款的资金科目 */
  private async resolveRepayAccount(dto: RepayLoanDto): Promise<Account> {
    if (dto.bankAccountId) {
      const bank = await this.bankRepo.findOne({ where: { id: dto.bankAccountId } })
      if (!bank) throw new BadRequestException('回款资金账户不存在')
      return this.resolveAccountOfBank(bank)
    }
    const code = dto.repayMethod === LoanPayMethod.CASH ? DEFAULT_CASH_CODE : DEFAULT_BANK_CODE
    return this.requireAccount(code)
  }

  private async resolveAccountOfBank(bank: BankAccount): Promise<Account> {
    if (!bank.accountCode) {
      throw new BadRequestException(`资金账户「${bank.name}」未关联会计科目`)
    }
    const account = await this.accountRepo.findOne({ where: { code: bank.accountCode } })
    if (!account) {
      throw new BadRequestException(`资金账户「${bank.name}」关联的科目 ${bank.accountCode} 不存在`)
    }
    if (!account.isLeaf) {
      throw new BadRequestException(`资金账户关联科目「${account.fullName}」不是明细科目`)
    }
    return account
  }

  private async requireAccount(code: string): Promise<Account> {
    const account = await this.accountRepo.findOne({ where: { code } })
    if (!account) {
      throw new BadRequestException(`系统默认科目「${code}」不存在，请在「会计科目」中确认`)
    }
    if (!account.isLeaf) {
      throw new BadRequestException(`系统默认科目「${code}」不是明细科目`)
    }
    return account
  }

  private statusLabel(status: string): string {
    switch (status) {
      case LoanStatus.DRAFT:
        return '草稿'
      case LoanStatus.APPROVED:
        return '已借款'
      case LoanStatus.REPAID:
        return '已还款'
      case LoanStatus.REJECTED:
        return '已驳回'
      default:
        return status
    }
  }

  private toVo(loan: Loan): any {
    const offsetAmount = Number(loan.offsetAmount ?? 0)
    const outstanding = this.settlementService.outstandingOf(loan)
    return {
      id: loan.id,
      loanNo: loan.loanNo,
      loanDate: loan.loanDate,
      employeeId: loan.employeeId,
      employeeName: loan.employeeName,
      departmentId: loan.departmentId,
      departmentName: loan.departmentName,
      amount: loan.amount,
      repaidAmount: Number(loan.repaidAmount ?? 0),
      offsetAmount,
      outstanding: outstanding / 100,
      reason: loan.reason,
      payMethod: loan.payMethod,
      status: loan.status,
      statusLabel: this.statusLabel(loan.status),
      bankAccountId: loan.bankAccountId,
      bankAccountName: loan.bankAccountName,
      voucherId: loan.voucherId,
      repayVoucherId: loan.repayVoucherId,
      createdByName: loan.createdByName,
      approvedAt: loan.approvedAt,
      repaidAt: loan.repaidAt,
      repayDate: loan.repayDate,
      remark: loan.remark,
      createdAt: loan.createdAt,
    }
  }

  /**
   * 某员工尚未还清的借款单（供报销单/采购发票选择抵充对象）
   */
  async outstandingLoans(employeeId: string): Promise<any[]> {
    if (!employeeId) return []
    const loans = await this.repo.find({
      where: { employeeId, status: 'approved' },
      order: { loanDate: 'ASC' },
    })
    return loans
      .map((l) => ({ loan: l, outstanding: this.settlementService.outstandingOf(l) }))
      .filter((x) => x.outstanding > 0)
      .map(({ loan: l, outstanding }) => ({
        id: l.id,
        loanNo: l.loanNo,
        loanDate: l.loanDate,
        amount: l.amount,
        outstanding: outstanding / 100,
      }))
  }

  /** 供员工模块复用：查询某员工的借款记录数 */
  async countByEmployee(employeeId: string): Promise<number> {
    return this.repo.count({ where: { employeeId } })
  }

  /** 校验借款单关联的凭证是否仍然有效 */
  async assertNoVoucher(id: string): Promise<void> {
    const loan = await this.findEntity(id)
    if (loan.voucherId) {
      throw new ConflictException('该借款单已生成凭证，无法删除')
    }
  }
}
