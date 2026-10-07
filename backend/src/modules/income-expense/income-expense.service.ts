import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { IncomeExpense } from '../../entities/business.entity'
import { Account } from '../../entities/account.entity'
import { BankAccount } from '../../entities/bank-account.entity'
import { Voucher } from '../../entities/voucher.entity'
import { VoucherSource, VoucherStatus } from '../../common/enums'
import { toCents } from '../../common/utils/money.util'
import { VouchersService } from '../vouchers/vouchers.service'
import type { Operator } from '../cash-bank/cash-bank.service'
import type { PageResult, PaginationQueryDto } from '../../common/dto/pagination.dto'
import type { SaveIncomeExpenseDto } from './dto/income-expense.dto'

/** 未指定收付款账户时使用的默认科目编码 */
const DEFAULT_CASH_CODE = '1001'
const DEFAULT_BANK_CODE = '1002'

@Injectable()
export class IncomeExpenseService {
  constructor(
    @InjectRepository(IncomeExpense) private readonly repo: Repository<IncomeExpense>,
    @InjectRepository(Account) private readonly accountRepo: Repository<Account>,
    @InjectRepository(BankAccount) private readonly bankRepo: Repository<BankAccount>,
    @InjectRepository(Voucher) private readonly voucherRepo: Repository<Voucher>,
    private readonly vouchersService: VouchersService,
  ) {}

  async findAll(
    query: PaginationQueryDto & { bizType?: string; startDate?: string; endDate?: string },
  ): Promise<PageResult<any>> {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const qb = this.repo.createQueryBuilder('i')

    if (query.bizType) qb.andWhere('i.bizType = :bizType', { bizType: query.bizType })
    if (query.startDate) qb.andWhere('i.bizDate >= :startDate', { startDate: query.startDate })
    if (query.endDate) qb.andWhere('i.bizDate <= :endDate', { endDate: query.endDate })
    if (query.keyword) {
      qb.andWhere('(i.summary LIKE :kw OR i.accountName LIKE :kw)', { kw: `%${query.keyword}%` })
    }

    const [list, total] = await qb
      .orderBy('i.bizDate', 'DESC')
      .addOrderBy('i.createdAt', 'DESC')
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

  async create(
    dto: SaveIncomeExpenseDto,
    operator: Operator,
    autoApprove = true,
  ): Promise<any> {
    const { account, bankAccount, bank, entries, defaultSummary } =
      await this.resolveContext(dto)

    const voucher = await this.vouchersService.createFromSystem(
      {
        word: '记',
        voucherDate: dto.bizDate,
        entries,
        remark: dto.remark ?? dto.summary,
        sourceType: VoucherSource.INCOME_EXPENSE,
        sourceId: '',
        autoApprove,
      },
      operator,
    )

    const entity = this.repo.create({
      bizType: dto.bizType,
      bizDate: dto.bizDate.slice(0, 10),
      bankAccountId: bank?.id ?? null,
      bankAccountName: bank?.name ?? null,
      accountId: account.id,
      accountName: account.name,
      partnerId: dto.partnerId || null,
      departmentId: dto.departmentId || null,
      projectId: dto.projectId || null,
      amount: dto.amount,
      summary: dto.summary ?? defaultSummary,
      voucherId: voucher.id,
      createdBy: operator.id,
      createdByName: operator.nickname,
      remark: dto.remark ?? null,
    })

    const saved = await this.repo.save(entity)
    await this.voucherRepo.update(voucher.id, { sourceId: saved.id })
    void bankAccount
    return this.toVo(saved)
  }

  async update(
    id: string,
    dto: SaveIncomeExpenseDto,
    operator: Operator,
    autoApprove = true,
  ): Promise<any> {
    const entity = await this.repo.findOne({ where: { id } })
    if (!entity) throw new NotFoundException('单据不存在')

    if (entity.voucherId) {
      const old = await this.voucherRepo.findOne({ where: { id: entity.voucherId } })
      if (old && old.status === VoucherStatus.APPROVED) {
        throw new BadRequestException('已生成已审核凭证，请先反审核后再修改单据')
      }
      if (old) await this.vouchersService.remove(old.id)
    }

    const { account, bank, entries, defaultSummary } = await this.resolveContext(dto)

    const voucher = await this.vouchersService.createFromSystem(
      {
        word: '记',
        voucherDate: dto.bizDate,
        entries,
        remark: dto.remark ?? dto.summary,
        sourceType: VoucherSource.INCOME_EXPENSE,
        sourceId: id,
        autoApprove,
      },
      operator,
    )

    entity.bizType = dto.bizType
    entity.bizDate = dto.bizDate.slice(0, 10)
    entity.bankAccountId = bank?.id ?? null
    entity.bankAccountName = bank?.name ?? null
    entity.accountId = account.id
    entity.accountName = account.name
    entity.partnerId = dto.partnerId || null
    entity.departmentId = dto.departmentId || null
    entity.projectId = dto.projectId || null
    entity.amount = dto.amount
    entity.summary = dto.summary ?? defaultSummary
    entity.voucherId = voucher.id
    entity.remark = dto.remark ?? null

    const saved = await this.repo.save(entity)
    return this.toVo(saved)
  }

  async remove(id: string): Promise<{ message: string }> {
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

    await this.repo.delete(id)
    return { message: '删除成功' }
  }

  // ==================== 内部 ====================

  private async resolveContext(dto: SaveIncomeExpenseDto): Promise<{
    account: Account
    bankAccount: Account
    bank: BankAccount | null
    entries: any[]
    defaultSummary: string
  }> {
    if (toCents(dto.amount) <= 0) {
      throw new BadRequestException('金额必须大于 0')
    }

    const account = await this.accountRepo.findOne({ where: { id: dto.accountId } })
    if (!account) throw new BadRequestException('会计科目不存在')
    if (!account.isLeaf) throw new BadRequestException(`科目「${account.fullName}」不是明细科目`)
    if (account.status !== 1) throw new BadRequestException(`科目「${account.fullName}」已禁用`)

    // 收付方科目
    let bank: BankAccount | null = null
    let bankAccount: Account
    if (dto.bankAccountId) {
      bank = await this.bankRepo.findOne({ where: { id: dto.bankAccountId } })
      if (!bank) throw new BadRequestException('资金账户不存在')
      if (!bank.accountCode) {
        throw new BadRequestException(`资金账户「${bank.name}」未关联会计科目`)
      }
      bankAccount = await this.accountRepo.findOne({ where: { code: bank.accountCode } })
      if (!bankAccount || !bankAccount.isLeaf) {
        throw new BadRequestException(`资金账户「${bank.name}」关联科目无效`)
      }
    } else {
      const code = dto.bizType === 'income' ? DEFAULT_BANK_CODE : DEFAULT_CASH_CODE
      bankAccount = await this.accountRepo.findOne({ where: { code } })
      if (!bankAccount) {
        throw new BadRequestException(`未找到默认资金科目「${code}」，请指定收付款账户`)
      }
    }

    if (bankAccount.id === account.id) {
      throw new BadRequestException('收付款科目不能与收入/费用科目相同')
    }

    const summary = dto.summary ?? (dto.bizType === 'income' ? '其他收入' : '其他支出')
    const aux = {
      partnerId: dto.partnerId,
      departmentId: dto.departmentId,
      projectId: dto.projectId,
    }

    const entries =
      dto.bizType === 'income'
        ? [
            { summary, accountId: bankAccount.id, debit: dto.amount, ...aux },
            { summary, accountId: account.id, credit: dto.amount, ...aux },
          ]
        : [
            { summary, accountId: account.id, debit: dto.amount, ...aux },
            { summary, accountId: bankAccount.id, credit: dto.amount, ...aux },
          ]

    const defaultSummary = `${summary} - ${bankAccount.name}`
    return { account, bankAccount, bank, entries, defaultSummary }
  }

  private toVo(entity: IncomeExpense): any {
    return {
      id: entity.id,
      bizType: entity.bizType,
      bizDate: entity.bizDate,
      bankAccountId: entity.bankAccountId,
      bankAccountName: entity.bankAccountName,
      accountId: entity.accountId,
      accountName: entity.accountName,
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