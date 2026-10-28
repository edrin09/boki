import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { WriteOff } from '@core/entities/business.entity'
import { Account } from '@core/entities/account.entity'
import { BankAccount } from '@core/entities/bank-account.entity'
import { Partner } from '@core/entities/partner.entity'
import { Voucher } from '@core/entities/voucher.entity'
import { VoucherSource, VoucherStatus } from '@core/common/enums'
import { toCents } from '@core/common/utils/money.util'
import { CompanyScopedRepository } from '@core/common/company/company.repository'
import { InjectCompanyRepo } from '@core/common/company/company-repo.decorator'
import { BooksService } from '@core/modules/books/books.service'
import { VouchersService } from '@core/modules/vouchers/vouchers.service'
import type { Operator } from '@core/common/types/operator'
import type { PageResult, PaginationQueryDto } from '@core/common/dto/pagination.dto'
import type { CreateWriteOffDto, QueryArApDto } from './dto/ar-ap.dto'

const DEFAULT_RECEIVABLE_CODE = '1122'
const DEFAULT_PAYABLE_CODE = '2202'

@Injectable()
export class ArApService {
  constructor(
    @InjectCompanyRepo(WriteOff) private readonly repo: CompanyScopedRepository<WriteOff>,
    @InjectCompanyRepo(Account) private readonly accountRepo: CompanyScopedRepository<Account>,
    @InjectCompanyRepo(BankAccount) private readonly bankRepo: CompanyScopedRepository<BankAccount>,
    @InjectCompanyRepo(Partner) private readonly partnerRepo: CompanyScopedRepository<Partner>,
    @InjectCompanyRepo(Voucher) private readonly voucherRepo: CompanyScopedRepository<Voucher>,
    private readonly booksService: BooksService,
    private readonly vouchersService: VouchersService,
  ) {}

  // ==================== 往来余额查询 ====================

  /** 应收余额（按往来单位） */
  async receivable(query: QueryArApDto): Promise<any> {
    return this.listByPartner(query, DEFAULT_RECEIVABLE_CODE, '应收')
  }

  /** 应付余额（按往来单位） */
  async payable(query: QueryArApDto): Promise<any> {
    return this.listByPartner(query, DEFAULT_PAYABLE_CODE, '应付')
  }

  private async listByPartner(
    query: QueryArApDto,
    defaultCode: string,
    label: string,
  ): Promise<any> {
    const code = query.accountCode || defaultCode
    const account = await this.accountRepo.findOne({ where: { code } })
    if (!account) {
      throw new NotFoundException(`科目「${code}」不存在，请在参数中指定 ${label} 科目编码`)
    }

    const result = await this.booksService.subLedger({
      accountId: account.id,
      endPeriod: query.endPeriod,
      fiscalYear: query.fiscalYear,
      partnerIds: query.partnerIds,
    })

    const onlyWithBalance = ['true', '1', true, 1].includes(query.onlyWithBalance as any)

    const rows = (result.groups ?? [])
      .map((g: any) => ({
        partnerId: g.partnerId,
        partnerName: g.partnerName,
        openingBalance:
          g.openingDebit > 0 ? g.openingDebit : g.openingCredit,
        periodDebit: g.periodDebit,
        periodCredit: g.periodCredit,
        closingBalance: g.closingDebit > 0 ? g.closingDebit : g.closingCredit,
        direction: g.closingDebit > 0 ? 'debit' : 'credit',
        entries: g.entries,
      }))
      .filter((r: any) => (onlyWithBalance ? r.closingBalance !== 0 : true))

    return {
      label,
      account: {
        id: account.id,
        code: account.code,
        name: account.name,
        fullName: account.fullName,
      },
      period: result.period,
      rows,
      totals: {
        closingDebit: result.totals.closingDebit,
        closingCredit: result.totals.closingCredit,
        balance:
          result.totals.closingDebit > 0
            ? result.totals.closingDebit
            : result.totals.closingCredit,
      },
    }
  }

  // ==================== 核销记录 ====================

  async findWriteOffs(query: PaginationQueryDto & { type?: string }): Promise<PageResult<any>> {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const qb = this.repo.createQueryBuilder('w')

    if (query.type) qb.andWhere('w.type = :type', { type: query.type })
    if (query.keyword) {
      qb.andWhere('(w.partnerName LIKE :kw OR w.summary LIKE :kw)', { kw: `%${query.keyword}%` })
    }

    const [list, total] = await qb
      .orderBy('w.bizDate', 'DESC')
      .addOrderBy('w.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount()

    return { list, total, page, pageSize }
  }

  /** 创建核销（生成凭证） */
  async createWriteOff(dto: CreateWriteOffDto, operator: Operator, autoApprove = true): Promise<any> {
    if (toCents(dto.amount) <= 0) {
      throw new BadRequestException('核销金额必须大于 0')
    }

    const partner = await this.partnerRepo.findOne({ where: { id: dto.partnerId } })
    if (!partner) throw new BadRequestException('往来单位不存在')
    if (partner.status !== 1) throw new BadRequestException('往来单位已禁用')

    const bank = await this.bankRepo.findOne({ where: { id: dto.bankAccountId } })
    if (!bank) throw new BadRequestException('资金账户不存在')
    if (!bank.accountCode) {
      throw new BadRequestException(`资金账户「${bank.name}」未关联会计科目`)
    }
    const bankAccount = await this.accountRepo.findOne({ where: { code: bank.accountCode } })
    if (!bankAccount || !bankAccount.isLeaf) {
      throw new BadRequestException(`资金账户「${bank.name}」关联科目无效`)
    }

    const arAccount = await this.resolveArApAccount(dto)
    const summary = dto.summary ?? (dto.type === 'receivable' ? '应收账款核销' : '应付账款核销')

    const entries =
      dto.type === 'receivable'
        ? [
            { summary, accountId: bankAccount.id, debit: dto.amount, partnerId: partner.id },
            { summary, accountId: arAccount.id, credit: dto.amount, partnerId: partner.id },
          ]
        : [
            { summary, accountId: arAccount.id, debit: dto.amount, partnerId: partner.id },
            { summary, accountId: bankAccount.id, credit: dto.amount, partnerId: partner.id },
          ]

    const voucher = await this.vouchersService.createFromSystem(
      {
        word: '记',
        voucherDate: dto.bizDate,
        entries,
        remark: dto.remark,
        sourceType: VoucherSource.AR_AP,
        sourceId: '',
        autoApprove,
      },
      operator,
    )

    const entity = this.repo.create({
      type: dto.type,
      partnerId: partner.id,
      partnerName: partner.name,
      bizDate: dto.bizDate.slice(0, 10),
      bankAccountId: bank.id,
      bankAccountName: bank.name,
      accountId: arAccount.id,
      accountName: arAccount.name,
      amount: dto.amount,
      summary,
      voucherId: voucher.id,
      createdBy: operator.id,
      createdByName: operator.nickname,
      remark: dto.remark ?? null,
    })

    const saved = await this.repo.save(entity)
    await this.voucherRepo.update({ id: voucher.id }, { sourceId: saved.id })
    return this.toVo(saved)
  }

  /** 撤销核销（同时删除对应凭证） */
  async removeWriteOff(id: string): Promise<{ message: string }> {
    const entity = await this.repo.findOne({ where: { id } })
    if (!entity) throw new NotFoundException('核销记录不存在')

    if (entity.voucherId) {
      const voucher = await this.voucherRepo.findOne({ where: { id: entity.voucherId } })
      if (voucher) {
        if (voucher.status === VoucherStatus.APPROVED) {
          await this.vouchersService.unapprove(voucher.id)
        }
        await this.vouchersService.remove(voucher.id)
      }
    }

    await this.repo.delete({ id } as any)
    return { message: '核销记录已撤销' }
  }

  private async resolveArApAccount(dto: CreateWriteOffDto): Promise<Account> {
    let account: Account | null = null
    if (dto.accountId) {
      account = await this.accountRepo.findOne({ where: { id: dto.accountId } })
      if (!account) throw new BadRequestException('应收/应付科目不存在')
    } else {
      const code = dto.type === 'receivable' ? DEFAULT_RECEIVABLE_CODE : DEFAULT_PAYABLE_CODE
      account = await this.accountRepo.findOne({ where: { code } })
      if (!account) {
        throw new BadRequestException(`未找到默认科目「${code}」，请在参数中指定应收/应付科目`)
      }
    }
    if (!account.isLeaf) {
      throw new BadRequestException(`科目「${account.fullName}」不是明细科目`)
    }
    if (account.status !== 1) {
      throw new BadRequestException(`科目「${account.fullName}」已禁用`)
    }
    return account
  }

  private toVo(entity: WriteOff): any {
    return {
      id: entity.id,
      type: entity.type,
      partnerId: entity.partnerId,
      partnerName: entity.partnerName,
      bizDate: entity.bizDate,
      bankAccountId: entity.bankAccountId,
      bankAccountName: entity.bankAccountName,
      accountId: entity.accountId,
      accountName: entity.accountName,
      amount: entity.amount,
      summary: entity.summary,
      voucherId: entity.voucherId,
      createdByName: entity.createdByName,
      remark: entity.remark,
      createdAt: entity.createdAt,
    }
  }
}