import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, Repository } from 'typeorm'
import { ExpenseClaim, ExpenseClaimItem } from '../../entities/hr.entity'
import { Employee } from '../../entities/hr.entity'
import { Department } from '../../entities/department.entity'
import { Account } from '../../entities/account.entity'
import { BankAccount } from '../../entities/bank-account.entity'
import { Voucher } from '../../entities/voucher.entity'
import {
  ExpenseClaimStatus,
  ExpensePayMethod,
  VoucherSource,
  VoucherStatus,
  VoucherWord,
} from '../../common/enums'
import { toCents, fromCents } from '../../common/utils/money.util'
import { VouchersService } from '../vouchers/vouchers.service'
import type { VoucherEntryDto } from '../vouchers/dto/voucher.dto'
import type { Operator } from '../cash-bank/cash-bank.service'
import type { PageResult, PaginationQueryDto } from '../../common/dto/pagination.dto'
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
    @InjectRepository(ExpenseClaim) private readonly repo: Repository<ExpenseClaim>,
    @InjectRepository(ExpenseClaimItem)
    private readonly itemRepo: Repository<ExpenseClaimItem>,
    @InjectRepository(Employee) private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Department) private readonly deptRepo: Repository<Department>,
    @InjectRepository(Account) private readonly accountRepo: Repository<Account>,
    @InjectRepository(BankAccount) private readonly bankRepo: Repository<BankAccount>,
    @InjectRepository(Voucher) private readonly voucherRepo: Repository<Voucher>,
    private readonly vouchersService: VouchersService,
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
    const claimNo = await this.getNextClaimNo(dto.claimDate)

    const entity = this.repo.create({
      claimNo,
      claimDate: dto.claimDate.slice(0, 10),
      employeeId: context.employee.id,
      employeeName: context.employee.name,
      departmentId: context.employee.departmentId,
      departmentName: context.departmentName,
      totalAmount: context.totalAmount,
      payMethod: dto.payMethod,
      status: ExpenseClaimStatus.DRAFT,
      expenseAccountId: context.defaultExpenseAccount?.id ?? null,
      expenseAccountName: context.defaultExpenseAccount?.name ?? null,
      bankAccountId: context.bankAccount?.id ?? null,
      bankAccountName: context.bankAccount?.name ?? null,
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
    claim.expenseAccountId = context.defaultExpenseAccount?.id ?? null
    claim.expenseAccountName = context.defaultExpenseAccount?.name ?? null
    claim.bankAccountId = context.bankAccount?.id ?? null
    claim.bankAccountName = context.bankAccount?.name ?? null
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

    return this.findOne(id)
  }

  /** 付款：生成付款凭证 */
  async pay(id: string, dto: PayExpenseClaimDto, operator: Operator): Promise<any> {
    const claim = await this.findEntity(id)
    if (claim.status !== ExpenseClaimStatus.APPROVED) {
      throw new BadRequestException('仅已审核的报销单可以付款')
    }
    if (claim.payMethod === ExpensePayMethod.ADVANCE) {
      // 员工垫付：审核时已贷其他应收款，付款只需冲销
      throw new BadRequestException('当前为「员工垫付」方式，付款请在「其他应收款」中核销，无需在此重复付款')
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
          { summary, accountId: advanceAccount.id, debit: Number(claim.totalAmount) },
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

    // 已审核但未付款：先撤销凭证
    if (claim.voucherId) {
      const voucher = await this.voucherRepo.findOne({ where: { id: claim.voucherId } })
      if (voucher) {
        if (voucher.status === VoucherStatus.APPROVED) {
          await this.vouchersService.unapprove(voucher.id)
        }
        await this.vouchersService.remove(voucher.id)
      }
    }

    await this.itemRepo.delete({ claimId: id })
    await this.repo.delete(id)
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
  private async buildCreditEntry(
    claim: ExpenseClaim,
    summary: string,
  ): Promise<{ summary: string; accountId: string; credit: number; partnerId?: string }> {
    const amount = Number(claim.totalAmount)

    if (claim.payMethod === ExpensePayMethod.ADVANCE) {
      // 员工垫付：挂其他应收款
      const advance = await this.requireAccount(DEFAULT_ADVANCE_CODE)
      return { summary, accountId: advance.id, credit: amount }
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