import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { In } from 'typeorm'
import { FixedExpense, FixedExpenseLog } from '../../entities/fixed-expense.entity'
import { Account } from '../../entities/account.entity'
import { BankAccount } from '../../entities/bank-account.entity'
import { CompanyScopedRepository } from '../../common/company/company.repository'
import { InjectCompanyRepo } from '../../common/company/company-repo.decorator'
import { IncomeExpenseService } from '../income-expense/income-expense.service'
import type { Operator } from '../cash-bank/cash-bank.service'
import type { PageResult, PaginationQueryDto } from '../../common/dto/pagination.dto'
import type { SaveFixedExpenseDto } from './dto/fixed-expense.dto'
import { toCents } from '../../common/utils/money.util'

/** 名称关键词 → 费用科目智能推荐规则（按命中顺序取第一条） */
const SUGGEST_RULES: { keywords: string[]; code: string; reason: string }[] = [
  { keywords: ['房租', '租金', '物业'], code: '6602', reason: '识别为房租/物业类支出' },
  { keywords: ['宽带', '网费', '网络', '光纤'], code: '6602', reason: '识别为网络通讯类支出' },
  { keywords: ['水电', '水费', '电费', '燃气'], code: '6602', reason: '识别为水电类支出' },
  { keywords: ['电话', '话费', '通讯'], code: '6602', reason: '识别为通讯类支出' },
  { keywords: ['广告', '推广', '宣传'], code: '6601', reason: '识别为市场推广类支出' },
  { keywords: ['服务器', '云服务', '域名', '软件', 'saas'], code: '6603', reason: '识别为技术服务类支出' },
  { keywords: ['研发', '开发'], code: '6603', reason: '识别为研发类支出' },
]

/** 期间工具：'YYYY-MM' */
function currentPeriod(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function periodOf(dateStr: string): string {
  return String(dateStr).slice(0, 7)
}

/** 期间加 n 个月 */
function addPeriod(period: string, n: number): string {
  const [y, m] = period.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

function comparePeriod(a: string, b: string): number {
  return a === b ? 0 : a < b ? -1 : 1
}

/** 期间内第 bizDay 天的日期，超出月末取月末 */
function bizDateFor(period: string, bizDay: number): string {
  const [y, m] = period.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const day = Math.min(Math.max(bizDay, 1), daysInMonth)
  return `${period}-${String(day).padStart(2, '0')}`
}

function frequencyStep(frequency: string): number {
  if (frequency === 'once') return 1200 // 一次性：只生成起始期，之后直接跳出循环
  return frequency === 'quarterly' ? 3 : frequency === 'yearly' ? 12 : 1
}

function toBool(v: unknown, fallback = true): boolean {
  if (v === undefined || v === null || v === '') return fallback
  return !(v === false || v === 0 || v === 'false' || v === '0')
}

@Injectable()
export class FixedExpenseService {
  constructor(
    @InjectCompanyRepo(FixedExpense) private readonly repo: CompanyScopedRepository<FixedExpense>,
    @InjectCompanyRepo(FixedExpenseLog) private readonly logRepo: CompanyScopedRepository<FixedExpenseLog>,
    @InjectCompanyRepo(Account) private readonly accountRepo: CompanyScopedRepository<Account>,
    @InjectCompanyRepo(BankAccount) private readonly bankRepo: CompanyScopedRepository<BankAccount>,
    private readonly incomeExpenseService: IncomeExpenseService,
  ) {}

  // ==================== 查询 ====================

  async findAll(query: PaginationQueryDto & { status?: number | string }): Promise<PageResult<any>> {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const qb = this.repo.createQueryBuilder('f')

    if (query.status !== undefined && query.status !== null && (query.status as unknown as string) !== '') {
      qb.andWhere('f.status = :status', { status: Number(query.status) })
    }
    if (query.keyword) {
      qb.andWhere('f.name LIKE :kw', { kw: `%${query.keyword}%` })
    }

    const [list, total] = await qb
      .orderBy('f.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount()

    const stats = await this.loadLogStats(list.map((t) => t.id))
    const current = currentPeriod()
    return {
      list: list.map((t) => {
        const stat = stats.get(t.id)
        return {
          ...this.toVo(t),
          lastPeriod: stat?.maxPeriod ?? null,
          generatedCount: stat?.count ?? 0,
          pendingPeriods: t.status === 1 ? this.pendingPeriodsOf(t, current) : [],
        }
      }),
      total,
      page,
      pageSize,
    }
  }

  /** 模板生成历史 */
  async logs(id: string): Promise<any[]> {
    const template = await this.repo.findOne({ where: { id } })
    if (!template) throw new NotFoundException('固定费用不存在')
    const rows = await this.logRepo.find({ where: { templateId: id } })
    return rows
      .sort((a, b) => comparePeriod(b.period, a.period))
      .map((r) => ({
        id: r.id,
        period: r.period,
        bizDate: r.bizDate,
        amount: r.amount,
        incomeExpenseId: r.incomeExpenseId,
        voucherId: r.voucherId,
        createdAt: r.createdAt,
      }))
  }

  /**
   * 待生成清单：所有启用模板在截至期间内应生成而未生成的期间。
   * 供固定费用页提示、月结检查、一键生成共用。
   */
  async pending(untilPeriod?: string): Promise<{
    count: number
    totalAmount: number
    currentPeriod: string
    items: { id: string; name: string; periods: string[]; amount: number; subtotal: number }[]
  }> {
    const current = untilPeriod ? periodOf(untilPeriod) : currentPeriod()
    const templates = await this.repo.find({ where: { status: 1 } })
    const logs = await this.logRepo.find()
    const done = new Set(logs.map((l) => `${l.templateId}:${l.period}`))

    const items: { id: string; name: string; periods: string[]; amount: number; subtotal: number }[] = []
    for (const t of templates) {
      const periods = this.pendingPeriodsOf(t, current).filter((p) => !done.has(`${t.id}:${p}`))
      if (!periods.length) continue
      items.push({
        id: t.id,
        name: t.name,
        periods,
        amount: Number(t.amount),
        subtotal: Number(t.amount) * periods.length,
      })
    }

    const count = items.reduce((sum, i) => sum + i.periods.length, 0)
    const totalAmount = items.reduce((sum, i) => sum + i.subtotal, 0)
    return { count, totalAmount: Math.round(totalAmount * 100) / 100, currentPeriod: current, items }
  }

  // ==================== 写操作 ====================

  async create(dto: SaveFixedExpenseDto, operator: Operator): Promise<any> {
    await this.validateRefs(dto)
    const entity = this.repo.create({
      name: dto.name.trim(),
      frequency: dto.frequency,
      amount: dto.amount,
      accountId: dto.accountId,
      accountName: '',
      bankAccountId: dto.bankAccountId || null,
      bankAccountName: null,
      partnerId: dto.partnerId || null,
      departmentId: dto.departmentId || null,
      projectId: dto.projectId || null,
      bizDay: dto.bizDay ?? 1,
      startDate: dto.startDate.slice(0, 10),
      endDate: dto.endDate ? dto.endDate.slice(0, 10) : null,
      autoApprove: toBool(dto.autoApprove, true) ? 1 : 0,
      status: dto.status ?? 1,
      remark: dto.remark || null,
    })
    await this.fillNames(entity, dto)
    void operator
    const saved = await this.repo.save(entity)
    return this.toVo(saved)
  }

  async update(id: string, dto: SaveFixedExpenseDto): Promise<any> {
    const entity = await this.repo.findOne({ where: { id } })
    if (!entity) throw new NotFoundException('固定费用不存在')
    await this.validateRefs(dto)

    entity.name = dto.name.trim()
    entity.frequency = dto.frequency
    entity.amount = dto.amount
    entity.accountId = dto.accountId
    entity.bankAccountId = dto.bankAccountId || null
    entity.bankAccountName = null
    entity.partnerId = dto.partnerId || null
    entity.departmentId = dto.departmentId || null
    entity.projectId = dto.projectId || null
    entity.bizDay = dto.bizDay ?? entity.bizDay ?? 1
    entity.startDate = dto.startDate.slice(0, 10)
    entity.endDate = dto.endDate ? dto.endDate.slice(0, 10) : null
    entity.autoApprove = toBool(dto.autoApprove, true) ? 1 : 0
    if (dto.status !== undefined) entity.status = dto.status
    entity.remark = dto.remark || null
    await this.fillNames(entity, dto)

    const saved = await this.repo.save(entity)
    return this.toVo(saved)
  }

  async toggleStatus(id: string, status: number): Promise<any> {
    const entity = await this.repo.findOne({ where: { id } })
    if (!entity) throw new NotFoundException('固定费用不存在')
    entity.status = status === 0 ? 0 : 1
    const saved = await this.repo.save(entity)
    return this.toVo(saved)
  }

  async remove(id: string): Promise<{ message: string }> {
    const entity = await this.repo.findOne({ where: { id } })
    if (!entity) throw new NotFoundException('固定费用不存在')

    const logs = await this.logRepo.find({ where: { templateId: id } })
    if (logs.length > 0) {
      throw new BadRequestException(
        `该固定费用已生成过 ${logs.length} 期单据，不能删除；如不再需要请将其停用`,
      )
    }
    await this.repo.delete({ id } as any)
    return { message: '删除成功' }
  }

  // ==================== 智能生成 ====================

  /**
   * 批量生成到期未生成的固定费用单据（幂等：模板+期间唯一）。
   * 单模板失败不阻断其余模板。
   */
  async generate(operator: Operator, untilPeriod?: string): Promise<{
    createdCount: number
    failedCount: number
    results: { name: string; period: string; amount: number; voucherId: string | null }[]
    failures: { name: string; message: string }[]
  }> {
    const pendingData = await this.pending(untilPeriod)
    const results: { name: string; period: string; amount: number; voucherId: string | null }[] = []
    const failures: { name: string; message: string }[] = []

    for (const item of pendingData.items) {
      const template = await this.repo.findOne({ where: { id: item.id } })
      if (!template) continue

      for (const period of item.periods) {
        try {
          const bizDate = bizDateFor(period, template.bizDay)
          const summary = `${template.name}（${period}）固定费用`
          const saved = await this.incomeExpenseService.create(
            {
              bizType: 'expense',
              bizDate,
              accountId: template.accountId,
              bankAccountId: template.bankAccountId ?? undefined,
              partnerId: template.partnerId ?? undefined,
              departmentId: template.departmentId ?? undefined,
              projectId: template.projectId ?? undefined,
              amount: Number(template.amount),
              summary,
              remark: template.remark || '固定费用模板自动生成',
            },
            operator,
            toBool(template.autoApprove, true),
          )

          await this.logRepo.save(
            this.logRepo.create({
              templateId: template.id,
              period,
              bizDate,
              amount: Number(template.amount),
              incomeExpenseId: saved.id,
              voucherId: saved.voucherId ?? null,
            }),
          )
          results.push({ name: template.name, period, amount: Number(template.amount), voucherId: saved.voucherId ?? null })
        } catch (err) {
          failures.push({ name: template.name, message: (err as Error).message })
        }
      }
    }

    return { createdCount: results.length, failedCount: failures.length, results, failures }
  }

  // ==================== 智能推荐 ====================

  /** 按费用名称关键词推荐科目 */
  async suggest(name: string): Promise<{
    matched: boolean
    reason: string
    accountId: string | null
    accountName: string | null
  }> {
    const keyword = String(name ?? '').trim()
    if (!keyword) return { matched: false, reason: '', accountId: null, accountName: null }

    const lower = keyword.toLowerCase()
    const rule = SUGGEST_RULES.find((r) => r.keywords.some((k) => lower.includes(k.toLowerCase())))
    if (!rule) {
      return { matched: false, reason: '未命中规则，默认建议管理费用', accountId: null, accountName: null }
    }

    const account = await this.accountRepo.findOne({ where: { code: rule.code } })
    if (!account) {
      return { matched: false, reason: rule.reason, accountId: null, accountName: null }
    }
    return {
      matched: true,
      reason: `${rule.reason}，已推荐「${account.name}」`,
      accountId: account.id,
      accountName: account.name,
    }
  }

  // ==================== 内部 ====================

  /** 模板自起始期到截至期的全部应生成期间（按频率步进；一次性仅起始期 1 期） */
  private pendingPeriodsOf(t: FixedExpense, untilPeriod: string): string[] {
    const start = periodOf(t.startDate)
    const end = t.endDate ? periodOf(t.endDate) : null
    // 一次性：仅在起始期生成一期，且必须落在生效区间内
    if (t.frequency === 'once') {
      const inRange = comparePeriod(start, untilPeriod) <= 0 && (!end || comparePeriod(start, end) <= 0)
      return inRange ? [start] : []
    }
    const periods: string[] = []
    let cursor = start
    // 防御：起始期晚于截至期或异常循环，最多兜底 600 期
    for (let i = 0; i < 600 && comparePeriod(cursor, untilPeriod) <= 0; i++) {
      if (!end || comparePeriod(cursor, end) <= 0) periods.push(cursor)
      cursor = addPeriod(cursor, frequencyStep(t.frequency))
    }
    return periods
  }

  private async validateRefs(dto: SaveFixedExpenseDto): Promise<void> {
    if (toCents(dto.amount) <= 0) throw new BadRequestException('金额必须大于 0')
    if (dto.endDate && dto.endDate.slice(0, 10) < dto.startDate.slice(0, 10)) {
      throw new BadRequestException('失效日期不能早于生效起始日')
    }
    const account = await this.accountRepo.findOne({ where: { id: dto.accountId } })
    if (!account) throw new BadRequestException('费用科目不存在')
    if (!account.isLeaf) throw new BadRequestException(`科目「${account.fullName}」不是明细科目`)
    if (account.status !== 1) throw new BadRequestException(`科目「${account.fullName}」已禁用`)

    if (dto.bankAccountId) {
      const bank = await this.bankRepo.findOne({ where: { id: dto.bankAccountId } })
      if (!bank) throw new BadRequestException('支付账户不存在')
      if (!bank.accountCode) {
        throw new BadRequestException(`资金账户「${bank.name}」未关联会计科目`)
      }
    }
  }

  /** 回填科目名称与资金账户名称（辅助核算名称由生成时链路解析） */
  private async fillNames(entity: FixedExpense, dto: SaveFixedExpenseDto): Promise<void> {
    const account = await this.accountRepo.findOne({ where: { id: dto.accountId } })
    entity.accountName = account?.name ?? ''
    if (dto.bankAccountId) {
      const bank = await this.bankRepo.findOne({ where: { id: dto.bankAccountId } })
      entity.bankAccountName = bank?.name ?? null
    }
  }

  private async loadLogStats(templateIds: string[]): Promise<Map<string, { maxPeriod: string; count: number }>> {
    const map = new Map<string, { maxPeriod: string; count: number }>()
    if (!templateIds.length) return map
    const rows = await this.logRepo.find({ where: { templateId: In(templateIds) } })
    for (const r of rows) {
      const stat = map.get(r.templateId)
      if (!stat) {
        map.set(r.templateId, { maxPeriod: r.period, count: 1 })
      } else {
        stat.count += 1
        if (comparePeriod(r.period, stat.maxPeriod) > 0) stat.maxPeriod = r.period
      }
    }
    return map
  }

  private toVo(entity: FixedExpense): any {
    return {
      id: entity.id,
      name: entity.name,
      frequency: entity.frequency,
      amount: entity.amount,
      accountId: entity.accountId,
      accountName: entity.accountName,
      bankAccountId: entity.bankAccountId,
      bankAccountName: entity.bankAccountName,
      partnerId: entity.partnerId,
      departmentId: entity.departmentId,
      projectId: entity.projectId,
      bizDay: entity.bizDay,
      startDate: entity.startDate,
      endDate: entity.endDate,
      autoApprove: toBool(entity.autoApprove, true),
      status: entity.status,
      remark: entity.remark,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    }
  }
}
