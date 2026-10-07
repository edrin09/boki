import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Account } from '../../entities/account.entity'
import { InitialBalance } from '../../entities/initial-balance.entity'
import { VoucherEntry } from '../../entities/voucher-entry.entity'
import { BankAccount } from '../../entities/bank-account.entity'
import { buildTree, collectDescendantIds, sortTree } from '../../common/utils/tree.util'
import { AccountCategory, BalanceDirection } from '../../common/enums'
import type {
  CreateAccountDto,
  UpdateAccountDto,
} from './dto/account.dto'

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account) private readonly accountRepo: Repository<Account>,
    @InjectRepository(VoucherEntry) private readonly entryRepo: Repository<VoucherEntry>,
    @InjectRepository(InitialBalance)
    private readonly initialBalanceRepo: Repository<InitialBalance>,
    @InjectRepository(BankAccount) private readonly bankRepo: Repository<BankAccount>,
  ) {}

  // ==================== 查询 ====================

  /** 科目扁平列表（支持关键字、类别、状态过滤） */
  async findAll(params: {
    keyword?: string
    category?: string
    status?: number
    leafOnly?: boolean
  } = {}): Promise<Account[]> {
    const qb = this.accountRepo.createQueryBuilder('a')
    if (params.keyword) {
      qb.andWhere('(a.code LIKE :kw OR a.name LIKE :kw OR a.fullName LIKE :kw)', {
        kw: `%${params.keyword}%`,
      })
    }
    if (params.category) {
      qb.andWhere('a.category = :category', { category: params.category })
    }
    if (params.status !== undefined && params.status !== null) {
      qb.andWhere('a.status = :status', { status: params.status })
    }
    if (params.leafOnly) {
      qb.andWhere('a.isLeaf = :leaf', { leaf: true })
    }
    return qb.orderBy('a.code', 'ASC').getMany()
  }

  /** 科目树 */
  async findTree(params: { keyword?: string; status?: number } = {}): Promise<any[]> {
    const list = await this.findAll(params)
    const tree = buildTree(list)
    sortTree(tree)
    return tree
  }

  /** 明细科目（下拉选项用） */
  async findLeafOptions(params: { status?: number } = {}): Promise<any[]> {
    const list = await this.findAll({ ...params, leafOnly: true })
    return list.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      fullName: a.fullName,
      category: a.category,
      direction: a.direction,
      auxiliaryTypes: a.auxiliaryTypes ?? [],
      isCash: a.isCash,
      isBank: a.isBank,
    }))
  }

  async findOne(id: string): Promise<Account> {
    const account = await this.accountRepo.findOne({ where: { id } })
    if (!account) throw new NotFoundException('会计科目不存在')
    return account
  }

  /** 按编码查询 */
  async findByCode(code: string): Promise<Account | null> {
    return this.accountRepo.findOne({ where: { code } })
  }

  /** 批量按 ID 查询，返回 Map */
  async getCodeNameMap(ids: string[]): Promise<Map<string, { code: string; name: string; fullName: string }>> {
    if (!ids.length) return new Map()
    const list = await this.accountRepo.createQueryBuilder('a').where('a.id IN (:...ids)', { ids }).getMany()
    return new Map(list.map((a) => [a.id, { code: a.code, name: a.name, fullName: a.fullName }]))
  }

  // ==================== 写入 ====================

  async create(dto: CreateAccountDto): Promise<Account> {
    const exists = await this.accountRepo.findOne({ where: { code: dto.code } })
    if (exists) throw new ConflictException(`科目编码「${dto.code}」已存在`)

    let parent: Account | null = null
    if (dto.parentId) {
      parent = await this.accountRepo.findOne({ where: { id: dto.parentId } })
      if (!parent) throw new BadRequestException('上级科目不存在')
      if (parent.level >= 4) throw new BadRequestException('科目级次最多 4 级')
    }

    const category = (dto.category ?? parent?.category ?? AccountCategory.ASSET) as AccountCategory
    const level = parent ? parent.level + 1 : 1
    const fullName = parent ? `${parent.fullName}.${dto.name}` : dto.name
    const direction = (dto.direction ??
      parent?.direction ??
      (category === AccountCategory.ASSET || category === AccountCategory.COST
        ? BalanceDirection.DEBIT
        : BalanceDirection.CREDIT)) as BalanceDirection

    const account = this.accountRepo.create({
      code: dto.code,
      name: dto.name,
      fullName,
      category,
      level,
      direction,
      parentId: parent?.id ?? null,
      isLeaf: true,
      auxiliaryTypes: dto.auxiliaryTypes?.length ? (dto.auxiliaryTypes as any) : null,
      isCash: dto.isCash ?? false,
      isBank: dto.isBank ?? false,
      status: 1,
      sort: dto.sort ?? 0,
      remark: dto.remark ?? null,
    })

    const saved = await this.accountRepo.save(account)
    if (parent) {
      await this.accountRepo.update(parent.id, { isLeaf: false })
    }
    return saved
  }

  async update(id: string, dto: UpdateAccountDto): Promise<Account> {
    const account = await this.findOne(id)
    const nameChanged = dto.name !== undefined && dto.name !== account.name

    if (dto.name !== undefined) account.name = dto.name
    if (dto.direction !== undefined) {
      account.direction = dto.direction as BalanceDirection
    }
    if (dto.auxiliaryTypes !== undefined) {
      account.auxiliaryTypes = dto.auxiliaryTypes.length ? (dto.auxiliaryTypes as any) : null
    }
    if (dto.isCash !== undefined) account.isCash = dto.isCash
    if (dto.isBank !== undefined) account.isBank = dto.isBank
    if (dto.sort !== undefined) account.sort = dto.sort
    if (dto.remark !== undefined) account.remark = dto.remark || null

    const saved = await this.accountRepo.save(account)
    if (nameChanged) {
      await this.refreshFullNames(saved)
    }
    return saved
  }

  async updateStatus(id: string, status: number): Promise<Account> {
    const account = await this.findOne(id)
    if (status === 0 && account.isLeaf) {
      const used = await this.entryRepo.count({ where: { accountId: id } })
      if (used > 0) {
        throw new BadRequestException('该科目已有凭证分录，无法禁用')
      }
    }
    account.status = status
    return this.accountRepo.save(account)
  }

  async remove(id: string): Promise<{ message: string }> {
    const account = await this.findOne(id)

    const all = await this.accountRepo.find()
    const descendants = collectDescendantIds(all, id)
    if (descendants.size > 0) {
      throw new BadRequestException('请先删除下级科目后再删除当前科目')
    }

    const usedEntries = await this.entryRepo.count({ where: { accountId: id } })
    if (usedEntries > 0) {
      throw new BadRequestException(`该科目已被 ${usedEntries} 条凭证分录引用，无法删除。可改为「禁用」`)
    }

    const usedInitial = await this.initialBalanceRepo.count({ where: { accountId: id } })
    if (usedInitial > 0) {
      throw new BadRequestException('该科目已录入期初余额，无法删除')
    }

    const usedBank = await this.bankRepo.count({ where: { accountCode: account.code } })
    if (usedBank > 0) {
      throw new BadRequestException('该科目已被资金账户引用，无法删除')
    }

    await this.accountRepo.delete(id)
    return { message: '删除成功' }
  }

  // ==================== 内部方法 ====================

  /**
   * 科目名称变更后，级联刷新自身及所有子孙科目的 fullName
   */
  private async refreshFullNames(account: Account): Promise<void> {
    const prefix = account.parentId
      ? (await this.accountRepo.findOne({ where: { id: account.parentId } }))?.fullName
      : null
    const selfName = prefix ? `${prefix}.${account.name}` : account.name
    account.fullName = selfName
    await this.accountRepo.update(account.id, { fullName: selfName })

    const all = await this.accountRepo.find()
    const descendants = collectDescendantIds(all, account.id)
    if (!descendants.size) return

    const childList = all.filter((a) => descendants.has(a.id))
    for (const child of childList) {
      const parentFullName = child.parentId === account.id ? selfName : undefined
      const parent = parentFullName ? null : await this.accountRepo.findOne({ where: { id: child.parentId } })
      const newFullName = parentFullName
        ? `${parentFullName}.${child.name}`
        : `${parent?.fullName ?? ''}.${child.name}`
      if (newFullName !== child.fullName && newFullName !== '.') {
        await this.accountRepo.update(child.id, { fullName: newFullName })
      }
    }
  }

  /** 校验科目可用于分录（存在、启用、明细科目） */
  async assertUsable(accountId: string): Promise<Account> {
    const account = await this.accountRepo.findOne({
      where: { id: accountId, status: 1 },
    })
    if (!account) throw new BadRequestException('会计科目不存在或已禁用')
    if (!account.isLeaf) throw new BadRequestException(`科目「${account.fullName}」非明细科目，不能记账`)
    return account
  }
}