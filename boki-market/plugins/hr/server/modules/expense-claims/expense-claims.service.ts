import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Brackets, In } from 'typeorm'
import { ExpenseClaim, ExpenseClaimItem } from '@core/entities/hr.entity'
import { Employee } from '@core/entities/hr.entity'
import { Department } from '@core/entities/department.entity'
import { Account } from '@core/entities/account.entity'
import { BankAccount } from '@core/entities/bank-account.entity'
import { Voucher } from '@core/entities/voucher.entity'
import {
  ExpenseClaimStatus,
  ExpenseClaimType,
  ExpensePayMethod,
  VoucherSource,
  VoucherStatus,
  VoucherWord,
} from '@core/common/enums'
import { toCents, fromCents } from '@core/common/utils/money.util'
import { CompanyScopedRepository } from '@core/common/company/company.repository'
import { InjectCompanyRepo } from '@core/common/company/company-repo.decorator'
import { VouchersService } from '@core/modules/vouchers/vouchers.service'
import { EmployeeSettlementService } from '../loans/employee-settlement.service'
import type { VoucherEntryDto } from '@core/modules/vouchers/dto/voucher.dto'
import type { Operator } from '@core/common/types/operator'
import type { PageResult, PaginationQueryDto } from '@core/common/dto/pagination.dto'
import type { HrPdfPackageDto } from '@core/common/dto/pdf-package.dto'
import type {
  PayExpenseClaimDto,
  SaveExpenseClaimDto,
} from './dto/expense-claim.dto'

/** 默认费用科目编码 */
const DEFAULT_EXPENSE_CODE = '6602' // 管理费用
/** 员工垫付挂账科目 */
const DEFAULT_ADVANCE_CODE = '1221' // 其他应收款
/** 其他应收款下挂员工辅助核算 */
const DEFAULT_CASH_CODE = '1001'
const DEFAULT_BANK_CODE = '1002'

@Injectable()
export class ExpenseClaimsService {
  constructor(
    @InjectCompanyRepo(ExpenseClaim) private readonly repo: CompanyScopedRepository<ExpenseClaim>,
    @InjectCompanyRepo(ExpenseClaimItem)
    private readonly itemRepo: CompanyScopedRepository<ExpenseClaimItem>,
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
    const qb = this.repo.createQueryBuilder('c')

    if (query.status) qb.andWhere('c.status = :status', { status: query.status })
    if (query.employeeId) qb.andWhere('c.employeeId = :employeeId', { employeeId: query.employeeId })
    if (query.startDate) qb.andWhere('c.claimDate >= :startDate', { startDate: query.startDate })
    if (query.endDate) qb.andWhere('c.claimDate <= :endDate', { endDate: query.endDate })
    if (query.keyword) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('c.claimNo LIKE :kw', { kw: `%${query.keyword}%` })
            .orWhere('c.employeeName LIKE :kw', { kw: `%${query.keyword}%` })
            .orWhere('c.remark LIKE :kw', { kw: `%${query.keyword}%` })
        }),
      )
    }

    const [list, total] = await qb
      .orderBy('c.claimDate', 'DESC')
      .addOrderBy('c.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount()

    return { list: list.map((c) => this.toVo(c, [])), total, page, pageSize }
  }

  async findOne(id: string): Promise<any> {
    const claim = await this.repo.findOne({ where: { id } })
    if (!claim) throw new NotFoundException('报销单不存在')
    const items = await this.itemRepo.find({ where: { claimId: id }, order: { sort: 'ASC' } })
    return this.toVo(claim, items)
  }

  /**
   * 批量导出 PDF（原始凭证存根）用：按 ids 或筛选条件取单据+明细，最多 300 张
   */
  async findForPdfExport(
    dto: HrPdfPackageDto,
  ): Promise<Array<{ claim: ExpenseClaim; items: ExpenseClaimItem[] }>> {
    const MAX = 300
    let claims: ExpenseClaim[]
    if (dto.ids?.length) {
      claims = await this.repo.find({ where: { id: In(dto.ids.slice(0, MAX)) } })
    } else {
      const qb = this.repo.createQueryBuilder('c')
      if (dto.status) qb.andWhere('c.status = :status', { status: dto.status })
      if (dto.employeeId) qb.andWhere('c.employeeId = :employeeId', { employeeId: dto.employeeId })
      if (dto.startDate) qb.andWhere('c.claimDate >= :startDate', { startDate: dto.startDate })
      if (dto.endDate) qb.andWhere('c.claimDate <= :endDate', { endDate: dto.endDate })
      claims = await qb
        .orderBy('c.claimDate', 'ASC')
        .addOrderBy('c.claimNo', 'ASC')
        .take(MAX)
        .getMany()
    }
    if (!claims.length) return []

    const items = await this.itemRepo.find({ where: { claimId: In(claims.map((c) => c.id)) } })
    const byClaim = new Map<string, ExpenseClaimItem[]>()
    for (const it of items) {
      const arr = byClaim.get(it.claimId) ?? []
      arr.push(it)
      byClaim.set(it.claimId, arr)
    }
    for (const arr of byClaim.values()) arr.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    claims.sort((a, b) =>
      a.claimDate < b.claimDate ? -1 : a.claimDate > b.claimDate ? 1 : a.claimNo < b.claimNo ? -1 : 1,
    )
    return claims.map((claim) => ({ claim, items: byClaim.get(claim.id) ?? [] }))
  }

  /** 下一个报销单号 */
  async getNextClaimNo(date: string): Promise<string> {
    const year = date.slice(0, 4).replace(/^0+/, '') || date.slice(0, 4)
    const prefix = `BX${year}`
    const max = await this.repo
      .createQueryBuilder('c')
      .select('MAX(c.claimNo)', 'max')
      .where('c.claimNo LIKE :prefix', { prefix: `${prefix}%` })
      .getRawOne<{ max: string | null }>()
    const last = max?.max ?? `${prefix}000`
    const seq = parseInt(last.slice(prefix.length), 10) + 1 || 1
    return `${prefix}${String(seq).padStart(4, '0')}`
  }

  // ==================== 写入 ====================

  async create(dto: SaveExpenseClaimDto, operator: Operator): Promise<any> {
    const context = await this.resolveContext(dto)

    // 单号：优先使用外部单号（导入/手工指定），为空或已占用时自动生成
    let claimNo = (dto.claimNo ?? '').trim()
    if (claimNo) {
      const exists = await this.repo.findOne({ where: { claimNo } })
      if (exists) claimNo = ''
    }
    if (!claimNo) claimNo = await this.getNextClaimNo(dto.claimDate)

    const entity = this.repo.create({
      claimNo,
      claimDate: dto.claimDate.slice(0, 10),
      employeeId: context.employee.id,
      employeeName: context.employee.name,
      departmentId: context.employee.departmentId,
      departmentName: context.departmentName,
      totalAmount: context.totalAmount,
      payMethod: dto.payMethod,
      claimType: dto.claimType ?? (dto.loanId ? ExpenseClaimType.LOAN_OFFSET : ExpenseClaimType.PAYMENT),
      status: ExpenseClaimStatus.DRAFT,
      expenseAccountId: context.defaultExpenseAccount?.id ?? null,
      expenseAccountName: context.defaultExpenseAccount?.name ?? null,
      bankAccountId: context.bankAccount?.id ?? null,
      bankAccountName: context.bankAccount?.name ?? null,
      loanId: dto.loanId ?? null,
      loanNo: null,
      voucherId: null,
      payVoucherId: null,
      createdBy: operator.id,
      createdByName: operator.nickname,
      remark: dto.remark ?? null,
    })

    const saved = await this.repo.save(entity)
    await this.saveItems(saved.id, dto.items, context.defaultExpenseAccount)
    return this.findOne(saved.id)
  }

  async update(id: string, dto: SaveExpenseClaimDto, operator: Operator): Promise<any> {
    const claim = await this.findEntity(id)
    void operator
    this.assertDraft(claim, '编辑')

    const context = await this.resolveContext(dto)

    claim.claimDate = dto.claimDate.slice(0, 10)
    claim.employeeId = context.employee.id
    claim.employeeName = context.employee.name
    claim.departmentId = context.employee.departmentId
    claim.departmentName = context.departmentName
    claim.totalAmount = context.totalAmount
    claim.payMethod = dto.payMethod
    claim.claimType = dto.claimType ?? (dto.loanId ? ExpenseClaimType.LOAN_OFFSET : ExpenseClaimType.PAYMENT)
    claim.expenseAccountId = context.defaultExpenseAccount?.id ?? null
    claim.expenseAccountName = context.defaultExpenseAccount?.name ?? null
    claim.bankAccountId = context.bankAccount?.id ?? null
    claim.bankAccountName = context.bankAccount?.name ?? null
    claim.loanId = dto.loanId ?? null
    claim.remark = dto.remark ?? claim.remark

    await this.repo.save(claim)
    await this.itemRepo.delete({ claimId: id })
    await this.saveItems(id, dto.items, context.defaultExpenseAccount)
    return this.findOne(id)
  }

  /** 审核：生成费用报销凭证 */
  async approve(id: string, operator: Operator): Promise<any> {
    const claim = await this.findEntity(id)
    this.assertDraft(claim, '审核')

    const items = await this.itemRepo.find({ where: { claimId: id }, order: { sort: 'ASC' } })
    if (!items.length) throw new BadRequestException('报销单没有费用明细')

    const summary = `${claim.employeeName}报销`
    const entries: VoucherEntryDto[] = items.map((item) => {
      if (!item.accountId) {
        throw new BadRequestException(`费用行「${item.summary || '未命名'}」未指定费用科目`)
      }
      return {
        summary: item.summary || summary,
        accountId: item.accountId,
        departmentId: claim.departmentId ?? undefined,
        debit: Number(item.amount),
      }
    })

    // 贷方：按支付方式
    entries.push(await this.buildCreditEntry(claim, summary))

    const voucher = await this.vouchersService.createFromSystem(
      {
        word: VoucherWord.GENERAl,
        voucherDate: claim.claimDate,
        entries,
        remark: `报销单 ${claim.claimNo}`,
        sourceType: VoucherSource.EXPENSE_CLAIM,
        sourceId: id,
        autoApprove: true,
      },
      operator,
    )

    claim.status = ExpenseClaimStatus.APPROVED
    claim.voucherId = voucher.id
    claim.approvedAt = new Date()
    await this.repo.save(claim)

    // 冲抵借款：审核已生成的凭证登记为员工往来核销，并回写借款单已清偿金额。
    // 指定借款单时核销该笔；冲抵型未指定时按借款日期先后 FIFO 自动分配（先借先还）。
    const isLoanOffset =
      claim.payMethod === ExpensePayMethod.ADVANCE &&
      (claim.claimType === ExpenseClaimType.LOAN_OFFSET || Boolean(claim.loanId))
    if (isLoanOffset) {
      await this.settlementService.registerExisting(
        {
          settleType: 'expense_claim',
          sourceId: id,
          sourceNo: claim.claimNo,
          loanId: claim.loanId ?? undefined,
          employeeId: claim.employeeId,
          amount: Number(claim.totalAmount),
          settleDate: claim.claimDate,
          summary: `${claim.employeeName}报销抵充借款`,
          // 复用审核已生成的凭证，不重复出账
          voucherId: voucher.id,
          remark: `报销单 ${claim.claimNo} 抵充借款`,
        },
        operator,
      )
    }

    return this.findOne(id)
  }

  /** 付款：生成付款凭证 */
  async pay(id: string, dto: PayExpenseClaimDto, operator: Operator): Promise<any> {
    const claim = await this.findEntity(id)
    if (claim.status !== ExpenseClaimStatus.APPROVED) {
      throw new BadRequestException('仅已审核的报销单可以付款')
    }
    if (claim.payMethod === ExpensePayMethod.ADVANCE) {
      const isLoanOffset = claim.claimType === ExpenseClaimType.LOAN_OFFSET || Boolean(claim.loanId)
      if (isLoanOffset) {
        // 冲抵借款型：审核时已贷「其他应收款-员工」抵充借款，无需再付款
        throw new BadRequestException('当前为「冲抵借款」报销单，审核时已抵充员工借款，无需再付款')
      }
      // 直接付款型垫付挂账：审核时已贷「其他应收款-员工」，付款时借回并支付给员工
    }

    // 未指定付款账户时，按支付方式回退到默认资金科目
    const bankAccountId = dto.bankAccountId ?? claim.bankAccountId
    let bankAccount: Account
    if (bankAccountId) {
      const bank = await this.bankRepo.findOne({ where: { id: bankAccountId } })
      if (!bank) throw new BadRequestException('付款账户不存在')
      bankAccount = await this.resolveAccountOfBank(bank)
    } else {
      const code = claim.payMethod === ExpensePayMethod.CASH ? DEFAULT_CASH_CODE : DEFAULT_BANK_CODE
      bankAccount = await this.requireAccount(code)
    }

    const advanceAccount = await this.requireAccount(DEFAULT_ADVANCE_CODE)
    const summary = `支付${claim.employeeName}报销`

    const voucher = await this.vouchersService.createFromSystem(
      {
        word: VoucherWord.GENERAl,
        voucherDate: dto.payDate ?? new Date().toISOString().slice(0, 10),
        entries: [
          // 借 其他应收款-员工（挂员工辅助核算冲平垫付挂账）
          { summary, accountId: advanceAccount.id, employeeId: claim.employeeId, debit: Number(claim.totalAmount) },
          { summary, accountId: bankAccount.id, credit: Number(claim.totalAmount) },
        ],
        remark: dto.remark ?? `报销单 ${claim.claimNo} 付款`,
        sourceType: VoucherSource.EXPENSE_CLAIM,
        sourceId: id,
        autoApprove: true,
      },
      operator,
    )

    claim.status = ExpenseClaimStatus.PAID
    claim.payVoucherId = voucher.id
    claim.paidAt = new Date()
    claim.bankAccountId = bankAccountId ?? null
    claim.bankAccountName = bankAccount.name
    await this.repo.save(claim)

    return this.findOne(id)
  }

  /** 驳回 */
  async reject(id: string, reason: string): Promise<any> {
    const claim = await this.findEntity(id)
    this.assertDraft(claim, '驳回')

    claim.status = ExpenseClaimStatus.REJECTED
    claim.remark = `驳回原因：${reason}`
    await this.repo.save(claim)
    return this.findOne(id)
  }

  async remove(id: string): Promise<{ message: string }> {
    const claim = await this.findEntity(id)
    if (claim.status === ExpenseClaimStatus.PAID) {
      throw new BadRequestException('已付款的报销单不可删除')
    }

    // 已审核但未付款：先撤销凭证，并回滚对应的借款核销
    if (claim.voucherId) {
      const voucher = await this.voucherRepo.findOne({ where: { id: claim.voucherId } })
      if (voucher) {
        if (voucher.status === VoucherStatus.APPROVED) {
          await this.vouchersService.unapprove(voucher.id)
        }
        await this.vouchersService.remove(voucher.id)
      }
    }
    await this.settlementService.cancelBySource('expense_claim', id)

    await this.itemRepo.delete({ claimId: id })
    await this.repo.delete({ id } as any)
    return { message: '删除成功' }
  }

  // ==================== 内部 ====================

  private async findEntity(id: string): Promise<ExpenseClaim> {
    const claim = await this.repo.findOne({ where: { id } })
    if (!claim) throw new NotFoundException('报销单不存在')
    return claim
  }

  private assertDraft(claim: ExpenseClaim, action: string): void {
    if (claim.status !== ExpenseClaimStatus.DRAFT) {
      throw new BadRequestException(`当前状态为「${this.statusLabel(claim.status)}」，不可${action}`)
    }
  }

  private async saveItems(
    claimId: string,
    items: SaveExpenseClaimDto['items'],
    defaultAccount: Account | null,
  ): Promise<void> {
    const rows: ExpenseClaimItem[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (toCents(item.amount) <= 0) {
        throw new BadRequestException(`第 ${i + 1} 行：金额必须大于 0`)
      }
      const accountId = item.accountId ?? defaultAccount?.id ?? null
      let accountCode: string | null = null
      let accountName: string | null = null
      if (accountId) {
        const account = await this.accountRepo.findOne({ where: { id: accountId } })
        if (!account) throw new BadRequestException(`第 ${i + 1} 行：费用科目不存在`)
        if (!account.isLeaf) {
          throw new BadRequestException(`第 ${i + 1} 行：科目「${account.fullName}」不是明细科目`)
        }
        if (account.status !== 1) {
          throw new BadRequestException(`第 ${i + 1} 行：科目「${account.fullName}」已禁用`)
        }
        accountCode = account.code
        accountName = account.name
      }

      rows.push(
        this.itemRepo.create({
          claimId,
          summary: item.summary ?? '',
          accountId,
          accountCode,
          accountName,
          amount: item.amount,
          remark: item.remark ?? null,
          sort: i + 1,
        }),
      )
    }
    await this.itemRepo.save(rows)
  }

  private async resolveContext(dto: SaveExpenseClaimDto): Promise<{
    employee: Employee
    departmentName: string | null
    defaultExpenseAccount: Account | null
    bankAccount: BankAccount | null
    totalAmount: number
  }> {
    const employee = await this.employeeRepo.findOne({ where: { id: dto.employeeId } })
    if (!employee) throw new BadRequestException('员工不存在')
    if (employee.status !== 1) throw new BadRequestException('该员工已离职，无法提交报销')

    let departmentName: string | null = null
    if (employee.departmentId) {
      const dept = await this.deptRepo.findOne({ where: { id: employee.departmentId } })
      departmentName = dept?.name ?? null
    }

    let totalCents = 0
    for (const [index, item] of dto.items.entries()) {
      if (toCents(item.amount) <= 0) {
        throw new BadRequestException(`第 ${index + 1} 行：金额必须大于 0`)
      }
      totalCents += toCents(item.amount)
    }
    if (totalCents <= 0) throw new BadRequestException('报销金额必须大于 0')

    // 默认费用科目
    let defaultExpenseAccount: Account | null = null
    const needsDefault = dto.items.some((i) => !i.accountId)
    if (needsDefault) {
      defaultExpenseAccount = await this.accountRepo.findOne({
        where: { code: DEFAULT_EXPENSE_CODE },
      })
      if (!defaultExpenseAccount) {
        throw new BadRequestException(
          `存在未指定费用科目的明细行，请为每行指定科目，或先确认默认科目 ${DEFAULT_EXPENSE_CODE} 存在`,
        )
      }
    }

    // 付款账户
    let bankAccount: BankAccount | null = null
    if (dto.bankAccountId) {
      bankAccount = await this.bankRepo.findOne({ where: { id: dto.bankAccountId } })
      if (!bankAccount) throw new BadRequestException('付款账户不存在')
    }

    return {
      employee,
      departmentName,
      defaultExpenseAccount,
      bankAccount,
      totalAmount: fromCents(totalCents),
    }
  }

  /** 构造报销贷方分录 */
  /** 贷方：员工垫付挂「其他应收款-员工」并挂员工辅助核算，便于按员工拆分往来余额 */
  private async buildCreditEntry(
    claim: ExpenseClaim,
    summary: string,
  ): Promise<{ summary: string; accountId: string; credit: number; employeeId?: string }> {
    const amount = Number(claim.totalAmount)

    if (claim.payMethod === ExpensePayMethod.ADVANCE) {
      const advance = await this.requireAccount(DEFAULT_ADVANCE_CODE)
      return { summary, accountId: advance.id, credit: amount, employeeId: claim.employeeId }
    }

    const code =
      claim.payMethod === ExpensePayMethod.CASH ? DEFAULT_CASH_CODE : DEFAULT_BANK_CODE
    const account = await this.requireAccount(code)
    return { summary, accountId: account.id, credit: amount }
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
      case ExpenseClaimStatus.DRAFT:
        return '草稿'
      case ExpenseClaimStatus.APPROVED:
        return '已审核'
      case ExpenseClaimStatus.PAID:
        return '已付款'
      case ExpenseClaimStatus.REJECTED:
        return '已驳回'
      default:
        return status
    }
  }

  private toVo(claim: ExpenseClaim, items: ExpenseClaimItem[]): any {
    return {
      id: claim.id,
      claimNo: claim.claimNo,
      claimDate: claim.claimDate,
      employeeId: claim.employeeId,
      employeeName: claim.employeeName,
      departmentId: claim.departmentId,
      departmentName: claim.departmentName,
      totalAmount: claim.totalAmount,
      payMethod: claim.payMethod,
      claimType: claim.claimType,
      claimTypeLabel: claim.claimType === ExpenseClaimType.LOAN_OFFSET ? '冲抵借款' : '直接付款',
      loanId: claim.loanId,
      loanNo: claim.loanNo,
      status: claim.status,
      statusLabel: this.statusLabel(claim.status),
      expenseAccountId: claim.expenseAccountId,
      expenseAccountName: claim.expenseAccountName,
      bankAccountId: claim.bankAccountId,
      bankAccountName: claim.bankAccountName,
      voucherId: claim.voucherId,
      payVoucherId: claim.payVoucherId,
      createdByName: claim.createdByName,
      approvedAt: claim.approvedAt,
      paidAt: claim.paidAt,
      remark: claim.remark,
      createdAt: claim.createdAt,
      items: items.map((i) => ({
        id: i.id,
        summary: i.summary,
        accountId: i.accountId,
        accountCode: i.accountCode,
        accountName: i.accountName,
        amount: i.amount,
        remark: i.remark,
        sort: i.sort,
      })),
    }
  }

  /** 供工资/其他模块复用：查询某员工的报销记录数 */
  async countByEmployee(employeeId: string): Promise<number> {
    return this.repo.count({ where: { employeeId } })
  }

  /** 校验报销单关联的凭证是否仍然有效（用于外键约束检查） */
  async assertNoVoucher(id: string): Promise<void> {
    const claim = await this.findEntity(id)
    if (claim.voucherId) {
      throw new ConflictException('该报销单已生成凭证，无法删除')
    }
  }
}