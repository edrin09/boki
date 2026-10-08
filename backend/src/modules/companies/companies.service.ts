import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { Company } from '../../entities/company.entity'
import { UserCompany } from '../../entities/user-company.entity'
import { User } from '../../entities/user.entity'
import { Role } from '../../entities/role.entity'
import { Account } from '../../entities/account.entity'
import { Voucher } from '../../entities/voucher.entity'
import { VoucherEntry } from '../../entities/voucher-entry.entity'
import { invalidateCompanyCache } from '../../common/company/company-scope.interceptor'
import { runWithCompany, getCompanyContext } from '../../common/company/company-context'
import { ACCOUNT_SEED, CATEGORY_LABELS, inferCategory } from '../../db/seeds/account.seed'
import type {
  AddCompanyMemberDto,
  CreateCompanyDto,
  SetCompanyMemberDto,
  UpdateCompanyDto,
} from './dto/company.dto'

/** 小规模纳税人默认征收率 3%（减按政策由用户在「公司信息」调整） */
const DEFAULT_SMALL_SCALE_VAT_RATE = 3

/**
 * 自动生成凭证草稿的置信度阈值默认值。
 * 低于该值一律留给人工确认：错账要靠冲销才能修，宁可多问一句。
 */
export const DEFAULT_AUTO_POST_THRESHOLD = 0.8

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name)

  constructor(
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    @InjectRepository(UserCompany) private readonly linkRepo: Repository<UserCompany>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(Account) private readonly accountRepo: Repository<Account>,
    @InjectRepository(Voucher) private readonly voucherRepo: Repository<Voucher>,
    @InjectRepository(VoucherEntry) private readonly entryRepo: Repository<VoucherEntry>,
  ) {}

  // ==================== 查询 ====================

  /** 当前用户可访问的公司列表 */
  async findMyCompanies(userId: string): Promise<any[]> {
    const links = await this.linkRepo.find({ where: { userId, status: 1 } })
    if (!links.length) return []
    const companies = await this.companyRepo.find({
      where: { id: In(links.map((l) => l.companyId)) },
      order: { createdAt: 'ASC' },
    })
    const byId = new Map(companies.map((c) => [c.id, c]))
    return links
      .map((l) => {
        const company = byId.get(l.companyId)
        return company ? this.toVo(company, l) : null
      })
      .filter(Boolean)
  }

  /** 公司详情（含成员） */
  async findOne(id: string): Promise<any> {
    const company = await this.getEntity(id)
    const links = await this.linkRepo.find({ where: { companyId: id, status: 1 } })
    const users = links.length
      ? await this.userRepo.find({
          where: { id: In(links.map((l) => l.userId)) },
          relations: { roles: true },
        })
      : []
    const userMap = new Map(users.map((u) => [u.id, u]))
    return {
      ...this.toVo(company),
      members: links
        .map((l) => {
          const u = userMap.get(l.userId)
          if (!u) return null
          return {
            linkId: l.id,
            userId: u.id,
            username: u.username,
            nickname: u.nickname,
            isOwner: l.isOwner,
            roles: (u.roles ?? []).map((r) => ({ id: r.id, code: r.code, name: r.name })),
            roleIds: (u.roles ?? []).map((r) => r.id),
          }
        })
        .filter(Boolean),
    }
  }

  /** 公司是否启用 */
  async assertUsable(companyId: string, userId: string): Promise<Company> {
    const company = await this.getEntity(companyId)
    if (company.status !== 1) throw new ForbiddenException('该公司已停用')
    const link = await this.linkRepo.findOne({
      where: { companyId, userId, status: 1 },
    })
    if (!link) throw new ForbiddenException('您没有该公司的访问权限')
    return company
  }

  // ==================== 写入 ====================

  /**
   * 新建记账公司。
   *
   * 会计科目按标准模板初始化（或从当前公司复制），
   * 其余基础资料保持为空，由用户按需录入 —— 各公司数据天然隔离。
   */
  async create(dto: CreateCompanyDto, operatorId: string): Promise<Company> {
    const code = (dto.code ?? '').trim() || await this.nextCode(dto.name)
    const exists = await this.companyRepo.findOne({ where: { code } })
    if (exists) throw new ConflictException(`公司编码「${code}」已存在`)

    const company = await this.companyRepo.save(
      this.companyRepo.create({
        code,
        name: dto.name.trim(),
        taxNo: dto.taxNo?.trim() || null,
        taxpayerType: dto.taxpayerType ?? 'small_scale',
        // 一般纳税人按分税率申报，不设单一征收率
        vatRate: dto.taxpayerType === 'general' ? 0 : (dto.vatRate ?? DEFAULT_SMALL_SCALE_VAT_RATE),
        taxDeclareCycle: dto.taxDeclareCycle ?? 'month',
        autoPostThreshold: dto.autoPostThreshold ?? DEFAULT_AUTO_POST_THRESHOLD,
        autoPostEnabled: dto.autoPostEnabled ?? 1,
        legalPerson: dto.legalPerson?.trim() || null,
        industry: dto.industry?.trim() || null,
        address: dto.address?.trim() || null,
        bankName: dto.bankName?.trim() || null,
        bankAccount: dto.bankAccount?.trim() || null,
        fiscalStartMonth: dto.fiscalStartMonth ?? 1,
        status: 1,
        remark: dto.remark?.trim() || null,
      }),
    )

    // 新公司内部操作统一以该公司为上下文
    await runWithCompany({ companyId: company.id, userId: operatorId }, async () => {
      await this.initAccounts(company.id, dto.copyAccountsFromCurrent !== false)
    })

    if (dto.joinCurrentUser !== false) {
      await this.addMembers(company.id, [operatorId], true)
    }
    invalidateCompanyCache(company.id)
    return company
  }

  async update(id: string, dto: UpdateCompanyDto): Promise<Company> {
    const company = await this.getEntity(id)
    if (dto.code && dto.code !== company.code) {
      const dup = await this.companyRepo.findOne({ where: { code: dto.code } })
      if (dup) throw new ConflictException(`公司编码「${dto.code}」已存在`)
      company.code = dto.code
    }
    if (dto.name !== undefined) company.name = dto.name.trim()
    if (dto.taxNo !== undefined) company.taxNo = dto.taxNo.trim() || null
    if (dto.taxpayerType !== undefined) company.taxpayerType = dto.taxpayerType
    if (dto.vatRate !== undefined) company.vatRate = dto.vatRate
    if (dto.taxDeclareCycle !== undefined) company.taxDeclareCycle = dto.taxDeclareCycle
    if (dto.autoPostThreshold !== undefined) company.autoPostThreshold = dto.autoPostThreshold
    if (dto.autoPostEnabled !== undefined) company.autoPostEnabled = dto.autoPostEnabled
    if (dto.legalPerson !== undefined) company.legalPerson = dto.legalPerson.trim() || null
    if (dto.industry !== undefined) company.industry = dto.industry.trim() || null
    if (dto.address !== undefined) company.address = dto.address.trim() || null
    if (dto.bankName !== undefined) company.bankName = dto.bankName.trim() || null
    if (dto.bankAccount !== undefined) company.bankAccount = dto.bankAccount.trim() || null
    if (dto.fiscalStartMonth !== undefined) company.fiscalStartMonth = dto.fiscalStartMonth
    if (dto.status !== undefined) company.status = dto.status
    if (dto.remark !== undefined) company.remark = dto.remark.trim() || null

    const saved = await this.companyRepo.save(company)
    invalidateCompanyCache(id)
    return saved
  }

  /** 删除公司：必须无业务数据，且不能是唯一公司 */
  async remove(id: string, operatorId: string): Promise<{ message: string }> {
    // 先校验存在性（不存在时给出明确错误）
    await this.getEntity(id)
    const total = await this.companyRepo.count()
    if (total <= 1) throw new BadRequestException('至少保留一家记账公司')

    const stats = await this.countBusinessData(id)
    const dirty = Object.entries(stats).filter(([, n]) => n > 0)
    if (dirty.length) {
      throw new BadRequestException(
        `该公司已有账务数据（${dirty.map(([k, n]) => `${k} ${n} 条`).join('，')}），请先清理后再删除`,
      )
    }

    const links = await this.linkRepo.find({ where: { companyId: id } })
    const others = links.filter((l) => l.userId !== operatorId)
    if (others.length) {
      throw new BadRequestException('该公司仍授权给其他用户，请先取消授权')
    }

    await this.purgeCompanyData(id)
    await this.linkRepo.delete({ companyId: id })
    await this.companyRepo.delete(id)
    invalidateCompanyCache(id)
    return { message: '删除成功' }
  }

  /**
   * 删除公司下残留的附属数据（科目/往来单位等）。
   * 仅在公司无凭证等核心业务数据时调用。
   */
  private async purgeCompanyData(companyId: string): Promise<void> {
    const tables = [
      'fin_receipt',
      'fin_payroll_item',
      'fin_payroll',
      'fin_expense_claim_item',
      'fin_expense_claim',
      'fin_employee',
      'fin_income_expense',
      'fin_write_off',
      'fin_cash_flow',
      'fin_initial_balance',
      'fin_bank_account',
      'fin_project',
      'fin_department',
      'fin_partner',
      'fin_classify_rule',
      'fin_account',
    ]
    const repo = this.accountRepo.manager
    for (const table of tables) {
      try {
        await repo.getRepository(table).delete({ companyId })
      } catch (err) {
        this.logger.warn(`清理 ${table} 失败: ${(err as Error).message}`)
      }
    }
  }

  // ==================== 成员授权 ====================

  /** 授权若干用户访问该公司（幂等） */
  async addMembers(companyId: string, userIds: string[], asOwner = false): Promise<{ added: number }> {
    if (!userIds.length) return { added: 0 }
    await this.getEntity(companyId)

    const users = await this.userRepo.find({ where: { id: In(userIds) } })
    if (users.length !== userIds.length) {
      const found = new Set(users.map((u) => u.id))
      const missing = userIds.filter((id) => !found.has(id))
      throw new BadRequestException(`存在无效的用户：${missing.join('、')}`)
    }

    const existing = await this.linkRepo.find({ where: { companyId } })
    const byUser = new Map(existing.map((l) => [l.userId, l]))
    let added = 0
    for (const userId of userIds) {
      const link = byUser.get(userId)
      if (link) {
        if (link.status !== 1) {
          link.status = 1
          await this.linkRepo.save(link)
        }
        continue
      }
      await this.linkRepo.save(
        this.linkRepo.create({ userId, companyId, isOwner: asOwner, status: 1 }),
      )
      added += 1
    }
    return { added }
  }

  /** 批量授权并可同时覆盖用户角色（角色为全局 RBAC，对所有公司生效） */
  async setMembers(companyId: string, dto: SetCompanyMemberDto): Promise<any> {
    await this.getEntity(companyId)
    const links = await this.linkRepo.find({ where: { companyId, status: 1 } })
    const keep = new Set(dto.userIds)

    if (links.length > 1) {
      const removingOwner = links
        .filter((l) => !keep.has(l.userId) && l.isOwner)
        .map((l) => l.userId)
      if (removingOwner.length) {
        throw new BadRequestException('不能移除公司所有者，请先转让所有权')
      }
    }

    await this.addMembers(companyId, dto.userIds)
    if (dto.roleIds !== undefined) {
      if (!dto.roleIds.length) throw new BadRequestException('请至少选择一个角色')
      const roles = await this.roleRepo.find({ where: { id: In(dto.roleIds) } })
      if (roles.length !== dto.roleIds.length) throw new BadRequestException('存在无效的角色')
      const users = await this.userRepo.find({
        where: { id: In(dto.userIds) },
        relations: { roles: true },
      })
      for (const user of users) {
        user.roles = roles
        await this.userRepo.save(user)
      }
    }

    const toRemove = links.filter((l) => !keep.has(l.userId))
    if (toRemove.length) {
      await this.linkRepo.delete({ id: In(toRemove.map((l) => l.id)) } as any)
    }
    return this.findOne(companyId)
  }

  /** 取消某个用户的公司访问权 */
  async removeMember(companyId: string, userId: string): Promise<{ message: string }> {
    const link = await this.linkRepo.findOne({ where: { companyId, userId } })
    if (!link) throw new NotFoundException('该用户未被授权此公司')
    const total = await this.linkRepo.count({ where: { companyId, status: 1 } })
    if (total <= 1) throw new BadRequestException('公司至少需要保留一个可访问用户')
    if (link.isOwner) throw new BadRequestException('不能移除公司所有者')
    await this.linkRepo.delete({ id: link.id })
    return { message: '已取消授权' }
  }

  // ==================== 内部 ====================

  private async getEntity(id: string): Promise<Company> {
    const company = await this.companyRepo.findOne({ where: { id } })
    if (!company) throw new NotFoundException('记账公司不存在')
    return company
  }

  private async nextCode(name: string): Promise<string> {
    const prefix = name.replace(/[^0-9A-Za-z一-龥]/g, '').slice(0, 12) || 'CO'
    let code = prefix
    let n = 1
    while (await this.companyRepo.findOne({ where: { code } })) {
      n += 1
      code = `${prefix}${n}`
    }
    return code
  }

  /**
   * 初始化公司会计科目。
   *
   * 默认从内置标准模板生成；copyFromCurrent 为真时优先复制当前公司科目
   * （保留自定义科目与辅助核算设置），当前公司无科目时才回落到模板。
   *
   * 注意：这里走的是原始仓储而非隔离仓储，必须显式按 companyId 过滤，
   * 否则会读到其他公司的科目导致「看起来已初始化」的误判。
   */
  private async initAccounts(companyId: string, copyFromCurrent: boolean): Promise<number> {
    const existing = await this.accountRepo.count({ where: { companyId } })
    if (existing > 0) return 0

    if (copyFromCurrent) {
      const copied = await this.copyAccountsFromCurrent(companyId)
      if (copied > 0) return copied
    }
    return this.seedTemplateAccounts(companyId)
  }

  /** 复制当前公司的科目（重映射主键，保持父子关系） */
  private async copyAccountsFromCurrent(companyId: string): Promise<number> {
    // 只复制当前公司（上下文中的公司）的科目
    const currentId = getCompanyContext()?.companyId
    const source = currentId
      ? await this.accountRepo.find({ where: { companyId: currentId }, order: { sort: 'ASC' } })
      : []
    if (!source.length) return 0

    const idMap = new Map<string, string>()
    const rows: Account[] = []
    for (const a of source) {
      const entity = this.accountRepo.create({
        companyId,
        code: a.code,
        name: a.name,
        fullName: a.fullName,
        category: a.category,
        level: a.level,
        direction: a.direction,
        parentId: null,
        isLeaf: a.isLeaf,
        auxiliaryTypes: a.auxiliaryTypes,
        isCash: a.isCash,
        isBank: a.isBank,
        status: a.status,
        sort: a.sort,
        remark: a.remark,
      })
      const saved = await this.accountRepo.save(entity)
      idMap.set(a.id, saved.id)
      rows.push(saved)
    }

    // 回填父级关系
    for (const a of source) {
      if (!a.parentId) continue
      const child = rows.find((r) => r.code === a.code)
      const parentId = idMap.get(a.parentId)
      if (child && parentId) {
        await this.accountRepo.update({ id: child.id } as any, { parentId })
      }
    }
    return rows.length
  }

  /** 从内置标准模板生成科目（与系统首次初始化一致） */
  private async seedTemplateAccounts(companyId: string): Promise<number> {
    let order = 0
    const saveRecursive = async (
      nodes: typeof ACCOUNT_SEED,
      parentId: string | null,
      parentPath: string[],
    ): Promise<number> => {
      let count = 0
      for (const node of nodes) {
        order += 1
        const category = inferCategory(node.code)
        const path = [CATEGORY_LABELS[category] ?? category, ...parentPath, node.name]
        const saved = await this.accountRepo.save(
          this.accountRepo.create({
            companyId,
            code: node.code,
            name: node.name,
            fullName: path.join('.'),
            category,
            level: path.length - 1,
            direction: node.direction,
            parentId,
            isLeaf: !node.children?.length,
            auxiliaryTypes: node.auxiliaryTypes ?? null,
            isCash: node.isCash ?? false,
            isBank: node.isBank ?? false,
            status: 1,
            sort: node.sort ?? order,
            remark: null,
          }),
        )
        count += 1
        if (node.children?.length) {
          count += await saveRecursive(node.children, saved.id, path)
        }
      }
      return count
    }
    return saveRecursive(ACCOUNT_SEED, null, [])
  }

  /**
   * 统计该公司的记账业务数据量（删除前校验）。
   *
   * 只统计「记账凭证及其衍生单据」这类真正的账务记录；
   * 会计科目 / 往来单位等基础档案在建公司时即自动生成或由用户录入，
   * 属于可重建的参考数据，会随公司一并清除，不作为删除障碍。
   */
  private async countBusinessData(companyId: string): Promise<Record<string, number>> {
    const [vouchers, entries, claims, payrolls, receipts] = await Promise.all([
      this.voucherRepo.count({ where: { companyId } } as any),
      this.entryRepo.count({ where: { companyId } } as any),
      this.extraCount('fin_expense_claim', companyId),
      this.extraCount('fin_payroll', companyId),
      this.extraCount('fin_receipt', companyId),
    ])
    return { 记账凭证: vouchers, 凭证分录: entries, 报销单: claims, 工资单: payrolls, 票据: receipts }
  }

  /** 统计指定表在该公司的数据量 */
  private async extraCount(table: string, companyId: string): Promise<number> {
    try {
      return await this.accountRepo.manager.getRepository(table).count({ where: { companyId } } as any)
    } catch {
      return 0
    }
  }

  private toVo(company: Company, link?: UserCompany): Record<string, any> {
    return {
      id: company.id,
      code: company.code,
      name: company.name,
      taxNo: company.taxNo,
      taxpayerType: company.taxpayerType,
      vatRate: company.vatRate,
      taxDeclareCycle: company.taxDeclareCycle,
      autoPostThreshold: company.autoPostThreshold,
      autoPostEnabled: company.autoPostEnabled,
      legalPerson: company.legalPerson,
      industry: company.industry,
      address: company.address,
      bankName: company.bankName,
      bankAccount: company.bankAccount,
      fiscalStartMonth: company.fiscalStartMonth,
      status: company.status,
      remark: company.remark,
      createdAt: company.createdAt,
      isOwner: link?.isOwner ?? false,
    }
  }
}