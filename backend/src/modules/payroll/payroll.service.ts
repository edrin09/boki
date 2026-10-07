import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { Payroll, PayrollItem, Employee } from '../../entities/hr.entity'
import { Department } from '../../entities/department.entity'
import { Account } from '../../entities/account.entity'
import { BankAccount } from '../../entities/bank-account.entity'
import { Voucher } from '../../entities/voucher.entity'
import {
  EmployeeStatus,
  PayrollStatus,
  VoucherSource,
  VoucherStatus,
  VoucherWord,
} from '../../common/enums'
import { toCents, fromCents } from '../../common/utils/money.util'
import { VouchersService } from '../vouchers/vouchers.service'
import type { Operator } from '../cash-bank/cash-bank.service'
import type { PageResult, PaginationQueryDto } from '../../common/dto/pagination.dto'
import type {
  GeneratePayrollDto,
  PayPayrollDto,
  SavePayrollDto,
} from './dto/payroll.dto'

/** 默认科目编码 */
const DEFAULT_EXPENSE_CODE = '6602' // 管理费用（工资费用）
const DEFAULT_PAYABLE_CODE = '2211.01' // 应付职工薪酬-工资
const DEFAULT_DEDUCT_CODE = '2241' // 其他应付款（代扣社保/公积金）
const DEFAULT_TAX_CODE = '2221.04' // 应交税费-应交个人所得税
const DEFAULT_BANK_CODE = '1002' // 银行存款

@Injectable()
export class PayrollService {
  constructor(
    @InjectRepository(Payroll) private readonly repo: Repository<Payroll>,
    @InjectRepository(PayrollItem) private readonly itemRepo: Repository<PayrollItem>,
    @InjectRepository(Employee) private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Department) private readonly deptRepo: Repository<Department>,
    @InjectRepository(Account) private readonly accountRepo: Repository<Account>,
    @InjectRepository(BankAccount) private readonly bankRepo: Repository<BankAccount>,
    @InjectRepository(Voucher) private readonly voucherRepo: Repository<Voucher>,
    private readonly vouchersService: VouchersService,
  ) {}

  // ==================== 查询 ====================

  async findAll(
    query: PaginationQueryDto & { status?: string; startPeriod?: number; endPeriod?: number },
  ): Promise<PageResult<any>> {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const qb = this.repo.createQueryBuilder('p')

    if (query.status) qb.andWhere('p.status = :status', { status: query.status })
    if (query.startPeriod && query.endPeriod) {
      qb.andWhere('p.period BETWEEN :s AND :e', { s: query.startPeriod, e: query.endPeriod })
    }
    if (query.keyword) {
      qb.andWhere('p.payrollNo LIKE :kw', { kw: `%${query.keyword}%` })
    }

    const [list, total] = await qb
      .orderBy('p.period', 'DESC')
      .addOrderBy('p.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount()

    return { list: list.map((p) => this.toVo(p, [])), total, page, pageSize }
  }

  async findOne(id: string): Promise<any> {
    const payroll = await this.repo.findOne({ where: { id } })
    if (!payroll) throw new NotFoundException('工资单不存在')
    const items = await this.itemRepo.find({ where: { payrollId: id }, order: { sort: 'ASC' } })
    return this.toVo(payroll, items)
  }

  // ==================== 生成 ====================

  /** 按在职员工生成工资单草稿 */
  async generate(dto: GeneratePayrollDto, operator: Operator): Promise<any> {
    const exists = await this.repo.findOne({ where: { period: dto.period } })
    if (exists) {
      throw new BadRequestException(
        `${dto.period} 期间已存在工资单（${exists.payrollNo}），请直接编辑或先删除`,
      )
    }

    const qb = this.employeeRepo
      .createQueryBuilder('e')
      .where('e.status = :status', { status: EmployeeStatus.ON_JOB })
    if (dto.departmentId) {
      qb.andWhere('e.departmentId = :departmentId', { departmentId: dto.departmentId })
    }
    const employees = await qb.orderBy('e.code', 'ASC').getMany()

    if (!employees.length) {
      throw new BadRequestException('没有符合条件的在职员工')
    }

    const deptNames = await this.loadDeptNames()
    const payrollNo = await this.getNextPayrollNo(dto.period)

    const entity = this.repo.create({
      payrollNo,
      period: dto.period,
      payDate: dto.payDate.slice(0, 10),
      employeeCount: employees.length,
      status: PayrollStatus.DRAFT,
      remark: null,
      createdBy: operator.id,
      createdByName: operator.nickname,
    })
    const saved = await this.repo.save(entity)

    const items = employees.map((e, index) => this.buildItemRow(saved.id, e, deptNames, index))
    await this.itemRepo.save(items)
    await this.recalcTotals(saved.id)

    return this.findOne(saved.id)
  }

  /** 保存工资单（含明细） */
  async save(dto: SavePayrollDto, operator: Operator, id?: string): Promise<any> {
    const contexts = await this.resolveContexts(dto)

    const target = id ? await this.findEntity(id) : null
    if (target && target.status !== PayrollStatus.DRAFT) {
      throw new BadRequestException('仅草稿状态的工资单可以编辑')
    }

    if (!target) {
      const dup = await this.repo.findOne({ where: { period: dto.period } })
      if (dup) {
        throw new BadRequestException(`${dto.period} 期间已存在工资单，请直接编辑`)
      }
    }

    const totals = this.sumItems(contexts.items)

    const payroll = target ?? this.repo.create({ payrollNo: await this.getNextPayrollNo(dto.period) })

    payroll.period = dto.period
    payroll.payDate = dto.payDate.slice(0, 10)
    payroll.employeeCount = contexts.items.length
    payroll.totalGross = totals.gross
    payroll.totalInsurance = totals.insurance
    payroll.totalFund = totals.fund
    payroll.totalTax = totals.tax
    payroll.totalOtherDeduct = totals.otherDeduct
    payroll.totalNet = totals.net
    payroll.remark = dto.remark ?? null
    payroll.createdBy = operator.id
    payroll.createdByName = operator.nickname

    payroll.expenseAccountId = contexts.expenseAccount?.id ?? null
    payroll.expenseAccountName = contexts.expenseAccount?.name ?? null
    payroll.payableAccountId = contexts.payableAccount?.id ?? null
    payroll.payableAccountName = contexts.payableAccount?.name ?? null
    payroll.deductAccountId = contexts.deductAccount?.id ?? null
    payroll.deductAccountName = contexts.deductAccount?.name ?? null
    payroll.taxAccountId = contexts.taxAccount?.id ?? null
    payroll.taxAccountName = contexts.taxAccount?.name ?? null
    payroll.bankAccountId = contexts.bankAccount?.id ?? null
    payroll.bankAccountName = contexts.bankAccount?.name ?? null

    const saved = await this.repo.save(payroll)

    await this.itemRepo.delete({ payrollId: saved.id })
    const rows = contexts.items.map((item) =>
      this.itemRepo.create({ ...item, payrollId: saved.id }),
    )
    await this.itemRepo.save(rows)

    return this.findOne(saved.id)
  }

  async update(id: string, dto: SavePayrollDto, operator: Operator): Promise<any> {
    return this.save(dto, operator, id)
  }

  // ==================== 审核 / 发放 ====================

  /** 审核：计提工资费用（借 费用科目 贷 应付职工薪酬-工资） */
  async approve(id: string, operator: Operator): Promise<any> {
    const payroll = await this.findEntity(id)
    if (payroll.status !== PayrollStatus.DRAFT) {
      throw new BadRequestException('仅草稿状态的工资单可以审核')
    }

    const items = await this.itemRepo.find({ where: { payrollId: id } })
    if (!items.length) throw new BadRequestException('工资单没有员工明细')

    const expense = await this.requireAccount(
      payroll.expenseAccountId ?? undefined,
      DEFAULT_EXPENSE_CODE,
      '工资费用科目',
    )
    const payable = await this.requireAccount(
      payroll.payableAccountId ?? undefined,
      DEFAULT_PAYABLE_CODE,
      '应付职工薪酬科目',
    )

    const totalGross = this.sumRaw(items.map((i) => Number(i.gross)))

    const voucher = await this.vouchersService.createFromSystem(
      {
        word: VoucherWord.GENERAl,
        voucherDate: payroll.payDate,
        entries: [
          { summary: `计提${payroll.payrollNo}工资`, accountId: expense.id, debit: totalGross },
          { summary: `计提${payroll.payrollNo}工资`, accountId: payable.id, credit: totalGross },
        ],
        remark: `工资单 ${payroll.payrollNo} 计提`,
        sourceType: VoucherSource.PAYROLL,
        sourceId: id,
        autoApprove: true,
      },
      operator,
    )

    payroll.status = PayrollStatus.APPROVED
    payroll.voucherId = voucher.id
    payroll.approvedAt = new Date()
    await this.repo.save(payroll)

    return this.findOne(id)
  }

  /** 发放：借 应付职工薪酬-工资 贷 银行/代扣项 */
  async pay(id: string, dto: PayPayrollDto, operator: Operator): Promise<any> {
    const payroll = await this.findEntity(id)
    if (payroll.status !== PayrollStatus.APPROVED) {
      throw new BadRequestException('仅已审核的工资单可以发放')
    }

    const items = await this.itemRepo.find({ where: { payrollId: id } })
    if (!items.length) throw new BadRequestException('工资单没有员工明细')

    const totals = {
      insurance: this.sumRaw(items.map((i) => Number(i.insurancePersonal))),
      fund: this.sumRaw(items.map((i) => Number(i.fundPersonal))),
      tax: this.sumRaw(items.map((i) => Number(i.tax))),
      other: this.sumRaw(items.map((i) => Number(i.otherDeduct))),
      net: this.sumRaw(items.map((i) => Number(i.net))),
    }

    const payable = await this.requireAccount(
      payroll.payableAccountId ?? undefined,
      DEFAULT_PAYABLE_CODE,
      '应付职工薪酬科目',
    )
    // 未指定发放账户时回退到默认银行存款科目，不强制先建资金账户档案
    const bankAccount = await this.resolvePayAccount(dto.bankAccountId ?? payroll.bankAccountId)

    const summary = `发放${payroll.payrollNo}工资`
    const entries: any[] = [
      { summary, accountId: payable.id, debit: this.sumRaw(items.map((i) => Number(i.gross))) },
      { summary, accountId: bankAccount.id, credit: totals.net },
    ]

    // 代扣项合并成一笔，挂其他应付款
    const deductCents =
      toCents(totals.insurance) + toCents(totals.fund) + toCents(totals.other)
    if (deductCents > 0) {
      const deduct = await this.requireAccount(
        payroll.deductAccountId ?? undefined,
        DEFAULT_DEDUCT_CODE,
        '代扣款项挂账科目',
      )
      entries.push({ summary: `${summary}-代扣`, accountId: deduct.id, credit: fromCents(deductCents) })
    }
    if (toCents(totals.tax) > 0) {
      const tax = await this.requireAccount(
        payroll.taxAccountId ?? undefined,
        DEFAULT_TAX_CODE,
        '个税科目',
      )
      entries.push({ summary: `${summary}-个税`, accountId: tax.id, credit: totals.tax })
    }

    const voucher = await this.vouchersService.createFromSystem(
      {
        word: VoucherWord.GENERAl,
        voucherDate: dto.payDate ?? payroll.payDate,
        entries,
        remark: dto.remark ?? `工资单 ${payroll.payrollNo} 发放`,
        sourceType: VoucherSource.PAYROLL,
        sourceId: id,
        autoApprove: true,
      },
      operator,
    )

    payroll.status = PayrollStatus.PAID
    payroll.payVoucherId = voucher.id
    payroll.paidAt = new Date()
    payroll.bankAccountId = dto.bankAccountId ?? payroll.bankAccountId ?? null
    payroll.bankAccountName = bankAccount.name
    await this.repo.save(payroll)

    return this.findOne(id)
  }

  async remove(id: string): Promise<{ message: string }> {
    const payroll = await this.findEntity(id)
    if (payroll.status === PayrollStatus.PAID) {
      throw new BadRequestException('已发放的工资单不可删除')
    }

    if (payroll.voucherId) {
      const voucher = await this.voucherRepo.findOne({ where: { id: payroll.voucherId } })
      if (voucher) {
        if (voucher.status === VoucherStatus.APPROVED) {
          await this.vouchersService.unapprove(voucher.id)
        }
        await this.vouchersService.remove(voucher.id)
      }
    }

    await this.itemRepo.delete({ payrollId: id })
    await this.repo.delete(id)
    return { message: '删除成功' }
  }

  // ==================== 内部 ====================

  private async findEntity(id: string): Promise<Payroll> {
    const payroll = await this.repo.findOne({ where: { id } })
    if (!payroll) throw new NotFoundException('工资单不存在')
    return payroll
  }

  private async getNextPayrollNo(period: number): Promise<string> {
    const prefix = `GZ${period}`
    const max = await this.repo
      .createQueryBuilder('p')
      .select('MAX(p.payrollNo)', 'max')
      .where('p.payrollNo LIKE :prefix', { prefix: `${prefix}%` })
      .getRawOne<{ max: string | null }>()
    const last = max?.max ?? `${prefix}01`
    const seq = parseInt(last.slice(prefix.length), 10) + 1 || 1
    return `${prefix}${String(seq).padStart(2, '0')}`
  }

  private buildItemRow(
    payrollId: string,
    employee: Employee,
    deptNames: Map<string, string>,
    index: number,
  ): PayrollItem {
    const base = Number(employee.baseSalary ?? 0)
    return this.itemRepo.create({
      payrollId,
      employeeId: employee.id,
      employeeCode: employee.code,
      employeeName: employee.name,
      departmentName: employee.departmentId ? (deptNames.get(employee.departmentId) ?? null) : null,
      baseSalary: base,
      performance: 0,
      allowance: 0,
      overtime: 0,
      gross: base,
      insurancePersonal: 0,
      fundPersonal: 0,
      tax: 0,
      otherDeduct: 0,
      net: base,
      remark: null,
      sort: index + 1,
    })
  }

  private async resolveContexts(dto: SavePayrollDto): Promise<{
    items: Array<Omit<PayrollItem, 'id' | 'createdAt' | 'updatedAt'>>
    expenseAccount: Account | null
    payableAccount: Account | null
    deductAccount: Account | null
    taxAccount: Account | null
    bankAccount: BankAccount | null
  }> {
    const employeeIds = dto.items.map((i) => i.employeeId)
    const uniqueIds = Array.from(new Set(employeeIds))
    if (uniqueIds.length !== employeeIds.length) {
      throw new BadRequestException('存在重复的员工，请检查')
    }

    const employees = await this.employeeRepo.find({ where: { id: In(uniqueIds) } })
    const employeeMap = new Map(employees.map((e) => [e.id, e]))
    const missing = employeeIds.filter((id) => !employeeMap.has(id))
    if (missing.length) throw new BadRequestException('存在无效的员工')

    const deptNames = await this.loadDeptNames()

    const items: any[] = []
    for (let index = 0; index < dto.items.length; index++) {
      const item = dto.items[index]
      const employee = employeeMap.get(item.employeeId)!
      const employeeName = employee.name

      const base = toCents(item.baseSalary)
      const performance = toCents(item.performance ?? 0)
      const allowance = toCents(item.allowance ?? 0)
      const overtime = toCents(item.overtime ?? 0)
      const insurance = toCents(item.insurancePersonal ?? 0)
      const fund = toCents(item.fundPersonal ?? 0)
      const tax = toCents(item.tax ?? 0)
      const other = toCents(item.otherDeduct ?? 0)

      const grossCents = base + performance + allowance + overtime
      const deductCents = insurance + fund + tax + other
      if (deductCents > grossCents) {
        throw new BadRequestException(
          `员工「${employeeName}」的代扣合计（${fromCents(deductCents)}）超过应发工资（${fromCents(grossCents)}）`,
        )
      }

      items.push({
        payrollId: '',
        employeeId: employee.id,
        employeeCode: employee.code,
        employeeName,
        departmentName: employee.departmentId
          ? (deptNames.get(employee.departmentId) ?? null)
          : null,
        baseSalary: fromCents(base),
        performance: fromCents(performance),
        allowance: fromCents(allowance),
        overtime: fromCents(overtime),
        gross: fromCents(grossCents),
        insurancePersonal: fromCents(insurance),
        fundPersonal: fromCents(fund),
        tax: fromCents(tax),
        otherDeduct: fromCents(other),
        net: fromCents(grossCents - deductCents),
        remark: item.remark ?? null,
        sort: index + 1,
      })
    }

    // 科目：仅在需要时校验（存在代扣才需要代扣科目）
    const hasDeduct = items.some((i) => toCents(i.insurancePersonal) + toCents(i.fundPersonal) + toCents(i.otherDeduct) > 0)
    const hasTax = items.some((i) => toCents(i.tax) > 0)

    const expenseAccount = await this.optionalAccount(dto.expenseAccountId, DEFAULT_EXPENSE_CODE)
    const payableAccount = await this.optionalAccount(dto.payableAccountId, DEFAULT_PAYABLE_CODE)
    const deductAccount = hasDeduct
      ? await this.requireAccount(dto.deductAccountId ?? undefined, DEFAULT_DEDUCT_CODE, '代扣款项挂账科目')
      : await this.optionalAccount(dto.deductAccountId, DEFAULT_DEDUCT_CODE)
    const taxAccount = hasTax
      ? await this.requireAccount(dto.taxAccountId ?? undefined, DEFAULT_TAX_CODE, '个税科目')
      : await this.optionalAccount(dto.taxAccountId, DEFAULT_TAX_CODE)

    let bankAccount: BankAccount | null = null
    if (dto.bankAccountId) {
      bankAccount = await this.bankRepo.findOne({ where: { id: dto.bankAccountId } })
      if (!bankAccount) throw new BadRequestException('发放账户不存在')
    }

    return { items, expenseAccount, payableAccount, deductAccount, taxAccount, bankAccount }
  }

  private sumItems(items: any[]): {
    gross: number
    insurance: number
    fund: number
    tax: number
    otherDeduct: number
    net: number
  } {
    return {
      gross: this.sumRaw(items.map((i) => i.gross)),
      insurance: this.sumRaw(items.map((i) => i.insurancePersonal)),
      fund: this.sumRaw(items.map((i) => i.fundPersonal)),
      tax: this.sumRaw(items.map((i) => i.tax)),
      otherDeduct: this.sumRaw(items.map((i) => i.otherDeduct)),
      net: this.sumRaw(items.map((i) => i.net)),
    }
  }

  private sumRaw(list: number[]): number {
    return fromCents(list.reduce<number>((acc, n) => acc + toCents(n), 0))
  }

  private async recalcTotals(payrollId: string): Promise<void> {
    const items = await this.itemRepo.find({ where: { payrollId } })
    const payroll = await this.findEntity(payrollId)
    const totals = this.sumItems(items)
    payroll.totalGross = totals.gross
    payroll.totalInsurance = totals.insurance
    payroll.totalFund = totals.fund
    payroll.totalTax = totals.tax
    payroll.totalOtherDeduct = totals.otherDeduct
    payroll.totalNet = totals.net
    payroll.employeeCount = items.length
    await this.repo.save(payroll)
  }

  private async optionalAccount(id: string | undefined, fallbackCode: string): Promise<Account | null> {
    if (id) {
      const account = await this.accountRepo.findOne({ where: { id } })
      if (!account) throw new BadRequestException('指定的科目不存在')
      if (!account.isLeaf) throw new BadRequestException(`科目「${account.fullName}」不是明细科目`)
      return account
    }
    const account = await this.accountRepo.findOne({ where: { code: fallbackCode } })
    return account && account.isLeaf ? account : null
  }

  private async requireAccount(
    id: string | undefined,
    fallbackCode: string,
    label: string,
  ): Promise<Account> {
    if (id) {
      const account = await this.accountRepo.findOne({ where: { id } })
      if (!account) throw new BadRequestException(`${label}不存在`)
      if (!account.isLeaf) throw new BadRequestException(`${label}「${account.fullName}」不是明细科目`)
      if (account.status !== 1) throw new BadRequestException(`${label}「${account.fullName}」已禁用`)
      return account
    }
    const account = await this.accountRepo.findOne({ where: { code: fallbackCode } })
    if (!account) {
      throw new BadRequestException(`系统默认${label}「${fallbackCode}」不存在，请在「会计科目」中确认`)
    }
    if (!account.isLeaf) throw new BadRequestException(`系统默认${label}「${fallbackCode}」不是明细科目`)
    return account
  }

  private async resolveBankAccount(bankAccountId: string | null): Promise<BankAccount> {
    let bank: BankAccount | null = null
    if (bankAccountId) {
      bank = await this.bankRepo.findOne({ where: { id: bankAccountId } })
    } else {
      bank = await this.bankRepo.findOne({ where: { accountCode: DEFAULT_BANK_CODE, status: 1 } })
    }
    if (!bank) throw new BadRequestException('请选择发放账户，或先在「资金账户」中配置银行存款账户')
    return bank
  }

  /**
   * 解析发放账户对应的会计科目：
   * 1. 指定了资金账户档案 -> 用其关联科目
   * 2. 未指定 -> 直接回退到默认银行存款科目，避免必须先建档案
   */
  private async resolvePayAccount(bankAccountId: string | null): Promise<Account> {
    if (bankAccountId) {
      const bank = await this.bankRepo.findOne({ where: { id: bankAccountId } })
      if (!bank) throw new BadRequestException('发放账户不存在')
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
    return this.requireAccount(undefined, DEFAULT_BANK_CODE, '发放账户对应科目')
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

  private async loadDeptNames(): Promise<Map<string, string>> {
    const depts = await this.deptRepo.find()
    return new Map(depts.map((d) => [d.id, d.name]))
  }

  private statusLabel(status: string): string {
    switch (status) {
      case PayrollStatus.DRAFT:
        return '草稿'
      case PayrollStatus.APPROVED:
        return '已审核'
      case PayrollStatus.PAID:
        return '已发放'
      default:
        return status
    }
  }

  private toVo(payroll: Payroll, items: PayrollItem[]): any {
    return {
      id: payroll.id,
      payrollNo: payroll.payrollNo,
      period: payroll.period,
      payDate: payroll.payDate,
      employeeCount: payroll.employeeCount,
      totalGross: payroll.totalGross,
      totalInsurance: payroll.totalInsurance,
      totalFund: payroll.totalFund,
      totalTax: payroll.totalTax,
      totalOtherDeduct: payroll.totalOtherDeduct,
      totalNet: payroll.totalNet,
      status: payroll.status,
      statusLabel: this.statusLabel(payroll.status),
      expenseAccountId: payroll.expenseAccountId,
      expenseAccountName: payroll.expenseAccountName,
      payableAccountId: payroll.payableAccountId,
      payableAccountName: payroll.payableAccountName,
      deductAccountId: payroll.deductAccountId,
      deductAccountName: payroll.deductAccountName,
      taxAccountId: payroll.taxAccountId,
      taxAccountName: payroll.taxAccountName,
      bankAccountId: payroll.bankAccountId,
      bankAccountName: payroll.bankAccountName,
      voucherId: payroll.voucherId,
      payVoucherId: payroll.payVoucherId,
      createdByName: payroll.createdByName,
      approvedAt: payroll.approvedAt,
      paidAt: payroll.paidAt,
      remark: payroll.remark,
      createdAt: payroll.createdAt,
      items: items.map((i) => ({
        id: i.id,
        employeeId: i.employeeId,
        employeeCode: i.employeeCode,
        employeeName: i.employeeName,
        departmentName: i.departmentName,
        baseSalary: i.baseSalary,
        performance: i.performance,
        allowance: i.allowance,
        overtime: i.overtime,
        gross: i.gross,
        insurancePersonal: i.insurancePersonal,
        fundPersonal: i.fundPersonal,
        tax: i.tax,
        otherDeduct: i.otherDeduct,
        net: i.net,
        remark: i.remark,
        sort: i.sort,
      })),
    }
  }

  /** 供其他模块检查期间是否有工资单 */
  async countByPeriod(period: number): Promise<number> {
    return this.repo.count({ where: { period } })
  }
}