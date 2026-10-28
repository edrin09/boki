import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Brackets } from 'typeorm'
import { BankAccount } from '@core/entities/bank-account.entity'
import { Account } from '@core/entities/account.entity'
import { BankAccountType } from '@core/common/enums'
import { CODE_PREFIX, nextCode } from '@core/common/utils/code.util'
import { CompanyScopedRepository } from '@core/common/company/company.repository'
import { InjectCompanyRepo } from '@core/common/company/company-repo.decorator'
import type { PageResult, PaginationQueryDto } from '@core/common/dto/pagination.dto'
import type { CreateBankDto, UpdateBankDto } from './dto/bank.dto'

@Injectable()
export class BanksService {
  constructor(
    @InjectCompanyRepo(BankAccount) private readonly repo: CompanyScopedRepository<BankAccount>,
    @InjectCompanyRepo(Account) private readonly accountRepo: CompanyScopedRepository<Account>,
  ) {}

  async findAll(query: PaginationQueryDto & { type?: string }): Promise<PageResult<any>> {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const qb = this.repo.createQueryBuilder('b')

    if (query.keyword) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('b.code LIKE :kw', { kw: `%${query.keyword}%` })
            .orWhere('b.name LIKE :kw', { kw: `%${query.keyword}%` })
            .orWhere('b.accountNo LIKE :kw', { kw: `%${query.keyword}%` })
            .orWhere('b.bankName LIKE :kw', { kw: `%${query.keyword}%` })
        }),
      )
    }
    if (query.type) qb.andWhere('b.type = :type', { type: query.type })

    const [list, total] = await qb
      .orderBy('b.code', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount()

    return { list, total, page, pageSize }
  }

  async findOptions(type?: string): Promise<any[]> {
    const list = await this.repo.find({ where: { status: 1 }, order: { code: 'ASC' } })
    return list
      .filter((b) => !type || b.type === type)
      .map((b) => ({ id: b.id, code: b.code, name: b.name, type: b.type, accountCode: b.accountCode }))
  }

  async findOne(id: string): Promise<BankAccount> {
    const entity = await this.repo.findOne({ where: { id } })
    if (!entity) throw new NotFoundException('资金账户不存在')
    return entity
  }

  /** 预览下一个可用编码 */
  async getNextCode(): Promise<string> {
    return nextCode(this.repo, CODE_PREFIX.bank)
  }

  async create(dto: CreateBankDto): Promise<BankAccount> {
    const code = (dto.code ?? '').trim() || (await this.getNextCode())
    const exists = await this.repo.findOne({ where: { code } })
    if (exists) throw new ConflictException(`编码「${code}」已存在`)
    if (dto.accountCode) await this.assertAccountExists(dto.accountCode)

    const entity = this.repo.create({
      code,
      name: dto.name,
      type: (dto.type ?? 'bank') as BankAccountType,
      currency: 'CNY',
      accountCode: dto.accountCode ?? null,
      accountNo: dto.accountNo ?? null,
      bankName: dto.bankName ?? null,
      accountName: dto.accountName ?? null,
      remark: dto.remark ?? null,
      status: 1,
    })
    return this.repo.save(entity)
  }

  async update(id: string, dto: UpdateBankDto): Promise<BankAccount> {
    const entity = await this.findOne(id)
    if (dto.name !== undefined) entity.name = dto.name
    if (dto.type !== undefined) entity.type = dto.type as BankAccountType
    if (dto.accountCode !== undefined) {
      if (dto.accountCode) await this.assertAccountExists(dto.accountCode)
      entity.accountCode = dto.accountCode || null
    }
    if (dto.accountNo !== undefined) entity.accountNo = dto.accountNo || null
    if (dto.bankName !== undefined) entity.bankName = dto.bankName || null
    if (dto.accountName !== undefined) entity.accountName = dto.accountName || null
    if (dto.remark !== undefined) entity.remark = dto.remark || null
    if (dto.status !== undefined) entity.status = dto.status
    return this.repo.save(entity)
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.findOne(id)
    await this.repo.delete({ id } as any)
    return { message: '删除成功' }
  }

  private async assertAccountExists(code: string): Promise<void> {
    const exists = await this.accountRepo.findOne({ where: { code } })
    if (!exists) throw new NotFoundException(`关联科目「${code}」不存在`)
  }
}