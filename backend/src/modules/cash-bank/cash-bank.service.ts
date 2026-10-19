import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { CashFlow, BankStmtRow, BankStmtStatus } from '../../entities/business.entity'
import { Account } from '../../entities/account.entity'
import { BankAccount } from '../../entities/bank-account.entity'
import { Voucher } from '../../entities/voucher.entity'
import { CashBankBizType, VoucherSource, VoucherStatus, VoucherWord } from '../../common/enums'
import { toCents } from '../../common/utils/money.util'
import { CompanyScopedRepository } from '../../common/company/company.repository'
import { InjectCompanyRepo } from '../../common/company/company-repo.decorator'
import { VouchersService } from '../vouchers/vouchers.service'
import type { VoucherEntryDto } from '../vouchers/dto/voucher.dto'
import type { PageResult, PaginationQueryDto } from '../../common/dto/pagination.dto'
import type { SaveCashFlowDto } from './dto/cash-bank.dto'

export interface Operator {
  id: string
  nickname: string
}

@Injectable()
export class CashBankService {
  constructor(
    @InjectCompanyRepo(CashFlow) private readonly repo: CompanyScopedRepository<CashFlow>,
    @InjectCompanyRepo(Account) private readonly accountRepo: CompanyScopedRepository<Account>,
    @InjectCompanyRepo(BankAccount) private readonly bankRepo: CompanyScopedRepository<BankAccount>,
    @InjectCompanyRepo(Voucher) private readonly voucherRepo: CompanyScopedRepository<Voucher>,
    @InjectCompanyRepo(BankStmtRow) private readonly stmtRowRepo: CompanyScopedRepository<BankStmtRow>,
    private readonly vouchersService: VouchersService,
  ) {}

  // ==================== 查询 ====================

  async findAll(
    query: PaginationQueryDto & { bizType?: string; startDate?: string; endDate?: string },
  ): Promise<PageResult<any>> {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const qb = this.repo.createQueryBuilder('c')

    if (query.bizType) qb.andWhere('c.bizType = :bizType', { bizType: query.bizType })
    if (query.startDate) qb.andWhere('c.bizDate >= :startDate', { startDate: query.startDate })
    if (query.endDate) qb.andWhere('c.bizDate <= :endDate', { endDate: query.endDate })
    if (query.keyword) {
      qb.andWhere('(c.summary LIKE :kw OR c.bankAccountName LIKE :kw OR c.accountName LIKE :kw)', {
        kw: `%${query.keyword}%`,
      })
    }

    const [list, total] = await qb
      .orderBy('c.bizDate', 'DESC')
      .addOrderBy('c.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount()

    return { list, total, page, pageSize }
  }

  async findOne(id: string): Promise<any> {
    const entity = await this.repo.findOne({ where: { id } })
    if (!entity) throw new NotFoundException('单据不存在')
    return this.toVo(entity)
  }

  // ==================== 写入 ====================

  async create(dto: SaveCashFlowDto, operator: Operator, autoApprove = true): Promise<any> {
    const context = await this.resolveContext(dto)

    const voucher = await this.vouchersService.createFromSystem(
      {
        word: this.voucherWordOf(dto.bizType),
        voucherDate: dto.bizDate,
        entries: context.entries,
        remark: dto.remark ?? dto.summary,
        sourceType: VoucherSource.CASH_BANK,
        sourceId: '',
        autoApprove,
      },
      operator,
    )

    const entity = this.repo.create({
      bizType: dto.bizType as CashBankBizType,
      bizDate: dto.bizDate.slice(0, 10),
      bankAccountId: context.bank.id,
      bankAccountName: context.bank.name,
      accountId: context.counter?.id ?? null,
      accountName: context.counter?.name ?? null,
      toBankAccountId: context.toBank?.id ?? null,
      toBankAccountName: context.toBank?.name ?? null,
      toAccountId: context.toAccount?.id ?? null,
      partnerId: dto.partnerId || null,
      departmentId: dto.departmentId || null,
      projectId: dto.projectId || null,
      amount: dto.amount,
      summary: dto.summary ?? context.defaultSummary,
      voucherId: voucher.id,
      createdBy: operator.id,
      createdByName: operator.nickname,
      remark: dto.remark ?? null,
    })

    const saved = await this.repo.save(entity)
    // 回填 sourceId
    await this.voucherRepo.update({ id: voucher.id }, { sourceId: saved.id })
    return this.toVo(saved)
  }

  async update(
    id: string,
    dto: SaveCashFlowDto,
    operator: Operator,
    autoApprove = true,
  ): Promise<any> {
    const entity = await this.repo.findOne({ where: { id } })
    if (!entity) throw new NotFoundException('单据不存在')

    const context = await this.resolveContext(dto)

    // 作废并重建凭证，保证账实一致
    if (entity.voucherId) {
      const old = await this.voucherRepo.findOne({ where: { id: entity.voucherId } })
      if (old && old.status === VoucherStatus.APPROVED) {
        throw new BadRequestException('已生成已审核凭证，请先在凭证管理中反审核后再修改单据')
      }
      if (old) await this.vouchersService.remove(old.id)
    }

    const voucher = await this.vouchersService.createFromSystem(
      {
        word: this.voucherWordOf(dto.bizType),
        voucherDate: dto.bizDate,
        entries: context.entries,
        remark: dto.remark ?? dto.summary,
        sourceType: VoucherSource.CASH_BANK,
        sourceId: id,
        autoApprove,
      },
      operator,
    )

    entity.bizType = dto.bizType as CashBankBizType
    entity.bizDate = dto.bizDate.slice(0, 10)
    entity.bankAccountId = context.bank.id
    entity.bankAccountName = context.bank.name
    entity.accountId = context.counter?.id ?? null
    entity.accountName = context.counter?.name ?? null
    entity.toBankAccountId = context.toBank?.id ?? null
    entity.toBankAccountName = context.toBank?.name ?? null
    entity.toAccountId = context.toAccount?.id ?? null
    entity.partnerId = dto.partnerId || null
    entity.departmentId = dto.departmentId || null
    entity.projectId = dto.projectId || null
    entity.amount = dto.amount
    entity.summary = dto.summary ?? context.defaultSummary
    entity.voucherId = voucher.id
    entity.remark = dto.remark ?? null

    const saved = await this.repo.save(entity)
    return this.toVo(saved)
  }

  async remove(id: string, operator: Operator): Promise<{ message: string }> {
    const entity = await this.repo.findOne({ where: { id } })
    if (!entity) throw new NotFoundException('单据不存在')

    if (entity.voucherId) {
      const voucher = await this.voucherRepo.findOne({ where: { id: entity.voucherId } })
      if (voucher) {
        if (voucher.status === VoucherStatus.APPROVED) {
          await this.vouchersService.unapprove(voucher.id)
        }
        await this.vouchersService.remove(voucher.id)
      }
    }
    void operator
    await this.repo.delete({ id } as any)

    // 联动重置银行流水行：关联资金单据被删后，流水行恢复为待确认，避免状态悬挂
    const stmtRows = await this.stmtRowRepo.find({ where: { cashFlowId: id } })
    if (stmtRows.length) {
      for (const r of stmtRows) {
        r.status = BankStmtStatus.PENDING
        r.cashFlowId = null
        r.voucherId = null
        r.matchInfo = '关联资金单据已删除，重置为待确认'
      }
      await this.stmtRowRepo.save(stmtRows)
    }
    return { message: '删除成功' }
  }

  // ==================== 内部 ====================

  /** 凭证字 */
  private voucherWordOf(bizType: string): string {
    switch (bizType) {
      case 'receipt':
      case 'payment':
        return VoucherWord.GENERAl
      case 'transfer':
        return VoucherWord.TRANSFER
      default:
        return VoucherWord.GENERAl
    }
  }

  /**
   * 解析单据要素并生成分录
   */
  private async resolveContext(dto: SaveCashFlowDto): Promise<{
    bank: BankAccount
    bankAccount: Account
    counter: Account | null
    toBank: BankAccount | null
    toAccount: Account | null
    entries: VoucherEntryDto[]
    defaultSummary: string
  }> {
    if (toCents(dto.amount) <= 0) {
      throw new BadRequestException('金额必须大于 0')
    }

    const bank = await this.bankRepo.findOne({ where: { id: dto.bankAccountId } })
    if (!bank) throw new BadRequestException('资金账户不存在')
    if (bank.status !== 1) throw new BadRequestException('资金账户已禁用')

    const bankAccount = await this.resolveAccountOfBank(bank)

    let counter: Account | null = null
    if (dto.accountId) {
      counter = await this.accountRepo.findOne({ where: { id: dto.accountId } })
      if (!counter) throw new BadRequestException('对方科目不存在')
      if (!counter.isLeaf) throw new BadRequestException(`科目「${counter.fullName}」不是明细科目`)
      if (counter.status !== 1) throw new BadRequestException(`科目「${counter.fullName}」已禁用`)
    }

    let toBank: BankAccount | null = null
    let toAccount: Account | null = null
    if (dto.bizType === 'transfer') {
      if (!dto.toBankAccountId) throw new BadRequestException('转账单据请选择转入账户')
      if (dto.toBankAccountId === dto.bankAccountId) {
        throw new BadRequestException('转入账户不能与转出账户相同')
      }
      toBank = await this.bankRepo.findOne({ where: { id: dto.toBankAccountId } })
      if (!toBank) throw new BadRequestException('转入账户不存在')
      toAccount = await this.resolveAccountOfBank(toBank)
    }

    const aux = {
      partnerId: dto.partnerId,
      employeeId: dto.employeeId,
      departmentId: dto.departmentId,
      projectId: dto.projectId,
    }

    const base = {
      summary: dto.summary ?? '',
      ...aux,
    }

    let entries: VoucherEntryDto[]
    let defaultSummary: string

    switch (dto.bizType) {
      case 'receipt':
        requireCounter()
        entries = [
          { ...base, summary: base.summary || '收款', accountId: bankAccount.id, debit: dto.amount },
          { ...base, summary: base.summary || '收款', accountId: counter!.id, credit: dto.amount },
        ]
        defaultSummary = `收款 - ${bank.name}`
        break
      case 'payment':
        requireCounter()
        entries = [
          { ...base, summary: base.summary || '付款', accountId: counter!.id, debit: dto.amount },
          { ...base, summary: base.summary || '付款', accountId: bankAccount.id, credit: dto.amount },
        ]
        defaultSummary = `付款 - ${bank.name}`
        break
      case 'expense':
        requireCounter()
        entries = [
          { ...base, summary: base.summary || '费用报销', accountId: counter!.id, debit: dto.amount },
          { ...base, summary: base.summary || '费用报销', accountId: bankAccount.id, credit: dto.amount },
        ]
        defaultSummary = `费用支出 - ${bank.name}`
        break
      case 'income':
        requireCounter()
        entries = [
          { ...base, summary: base.summary || '其他收入', accountId: bankAccount.id, debit: dto.amount },
          { ...base, summary: base.summary || '其他收入', accountId: counter!.id, credit: dto.amount },
        ]
        defaultSummary = `其他收入 - ${bank.name}`
        break
      case 'transfer':
        entries = [
          { ...base, summary: base.summary || '内部转账', accountId: bankAccount.id, debit: dto.amount },
          { ...base, summary: base.summary || '内部转账', accountId: toAccount!.id, credit: dto.amount },
        ]
        defaultSummary = `转账 ${bank.name} → ${toBank!.name}`
        break
      default:
        throw new BadRequestException('不支持的单据类型')
    }

    function requireCounter(): void {
      if (!counter) {
        throw new BadRequestException('请选择对方会计科目')
      }
    }

    return { bank, bankAccount, counter, toBank, toAccount, entries, defaultSummary }
  }

  /** 取资金账户关联的会计科目 */
  private async resolveAccountOfBank(bank: BankAccount): Promise<Account> {
    if (!bank.accountCode) {
      throw new BadRequestException(`资金账户「${bank.name}」未关联会计科目，请先在「资金账户」中配置`)
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

  private toVo(entity: CashFlow): any {
    return {
      id: entity.id,
      bizType: entity.bizType,
      bizDate: entity.bizDate,
      bankAccountId: entity.bankAccountId,
      bankAccountName: entity.bankAccountName,
      accountId: entity.accountId,
      accountName: entity.accountName,
      toBankAccountId: entity.toBankAccountId,
      toBankAccountName: entity.toBankAccountName,
      partnerId: entity.partnerId,
      departmentId: entity.departmentId,
      projectId: entity.projectId,
      amount: entity.amount,
      summary: entity.summary,
      voucherId: entity.voucherId,
      createdByName: entity.createdByName,
      remark: entity.remark,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    }
  }
}