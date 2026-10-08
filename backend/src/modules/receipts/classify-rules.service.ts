import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Brackets } from 'typeorm'
import { ClassifyRule } from '../../entities/classify-rule.entity'
import { Account } from '../../entities/account.entity'
import { CompanyScopedRepository } from '../../common/company/company.repository'
import { InjectCompanyRepo } from '../../common/company/company-repo.decorator'
import type { PageResult, PaginationQueryDto } from '../../common/dto/pagination.dto'
import type { SaveClassifyRuleDto, ToggleRuleDto } from './dto/workbench.dto'

/**
 * 归类规则维护（P17.5）：增删改、启停、按命中次数排序。
 * 规则的语义由 classify.service 消费。
 */
@Injectable()
export class ClassifyRulesService {
  constructor(
    @InjectCompanyRepo(ClassifyRule) private readonly ruleRepo: CompanyScopedRepository<ClassifyRule>,
    @InjectCompanyRepo(Account) private readonly accountRepo: CompanyScopedRepository<Account>,
  ) {}

  async findAll(
    query: PaginationQueryDto & { matchType?: string; keyword?: string },
  ): Promise<PageResult<any>> {
    const page = query.page ?? 1
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20))
    const qb = this.ruleRepo.createQueryBuilder('r')

    if (query.matchType) qb.andWhere('r.matchType = :matchType', { matchType: query.matchType })
    if (query.keyword) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('r.ruleName LIKE :kw', { kw: `%${query.keyword}%` })
            .orWhere('r.matchValue LIKE :kw', { kw: `%${query.keyword}%` })
            .orWhere('r.targetAccountCode LIKE :kw', { kw: `%${query.keyword}%` })
        }),
      )
    }

    const [list, total] = await qb
      .orderBy('r.priority', 'DESC')
      .addOrderBy('r.hitCount', 'DESC')
      .addOrderBy('r.createdAt', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount()

    return { list: list.map((r) => this.toVo(r)), total, page, pageSize }
  }

  async create(dto: SaveClassifyRuleDto): Promise<any> {
    await this.validateAccount(dto.targetAccountCode)

    const dup = await this.ruleRepo.findOne({
      where: { matchType: dto.matchType, matchValue: dto.matchValue },
    })
    if (dup) {
      throw new ConflictException(
        `已存在相同匹配方式的规则「${dup.ruleName}」，请先编辑原规则`,
      )
    }

    const rule = this.ruleRepo.create({
      ruleName: dto.ruleName,
      matchType: dto.matchType,
      matchValue: dto.matchValue,
      kind: dto.kind,
      targetAccountCode: dto.targetAccountCode,
      priority: dto.priority ?? 0,
      enabled: dto.enabled ?? 1,
      hitCount: 0,
      learned: false,
    })
    const saved = await this.ruleRepo.save(rule)
    return this.toVo(saved)
  }

  async update(id: string, dto: SaveClassifyRuleDto): Promise<any> {
    const rule = await this.findEntity(id)
    await this.validateAccount(dto.targetAccountCode)

    const dup = await this.ruleRepo
      .createQueryBuilder('r')
      .where('r.matchType = :matchType', { matchType: dto.matchType })
      .andWhere('r.matchValue = :matchValue', { matchValue: dto.matchValue })
      .andWhere('r.id != :id', { id })
      .getOne()
    if (dup) {
      throw new ConflictException(
        `已存在相同匹配方式的规则「${dup.ruleName}」，请先编辑原规则`,
      )
    }

    rule.ruleName = dto.ruleName
    rule.matchType = dto.matchType
    rule.matchValue = dto.matchValue
    rule.kind = dto.kind
    rule.targetAccountCode = dto.targetAccountCode
    rule.priority = dto.priority ?? rule.priority
    rule.enabled = dto.enabled ?? rule.enabled
    const saved = await this.ruleRepo.save(rule)
    return this.toVo(saved)
  }

  async findOne(id: string): Promise<any> {
    return this.toVo(await this.findEntity(id))
  }

  async toggle(id: string, dto: ToggleRuleDto): Promise<any> {
    const rule = await this.findEntity(id)
    rule.enabled = dto.enabled
    const saved = await this.ruleRepo.save(rule)
    return this.toVo(saved)
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.findEntity(id)
    await this.ruleRepo.delete({ id } as any)
    return { message: '规则已删除' }
  }

  /** 规则 → 前端展示对象 */
  toVo(r: ClassifyRule): Record<string, unknown> {
    return {
      id: r.id,
      ruleName: r.ruleName,
      matchType: r.matchType,
      matchValue: r.matchValue,
      kind: r.kind,
      targetAccountCode: r.targetAccountCode,
      priority: r.priority,
      enabled: r.enabled,
      hitCount: r.hitCount,
      learned: r.learned,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }
  }

  private async findEntity(id: string): Promise<ClassifyRule> {
    const rule = await this.ruleRepo.findOne({ where: { id } })
    if (!rule) throw new NotFoundException('归类规则不存在')
    return rule
  }

  private async validateAccount(code: string): Promise<void> {
    const account = await this.accountRepo.findOne({ where: { code } })
    if (!account) throw new BadRequestException(`科目编码「${code}」不存在`)
    if (!account.isLeaf) {
      throw new BadRequestException(`科目「${account.fullName}」不是明细科目，不能作为归类目标`)
    }
    if (account.status !== 1) {
      throw new BadRequestException(`科目「${account.fullName}」已禁用`)
    }
  }
}
