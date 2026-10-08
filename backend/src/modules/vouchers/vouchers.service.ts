import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { DataSource, EntityManager, In } from 'typeorm'
import { Voucher } from '../../entities/voucher.entity'
import { VoucherEntry } from '../../entities/voucher-entry.entity'
import { Account } from '../../entities/account.entity'
import { Partner } from '../../entities/partner.entity'
import { Department } from '../../entities/department.entity'
import { Project } from '../../entities/project.entity'
import { VoucherSource, VoucherStatus } from '../../common/enums'
import { toCents, fromCents } from '../../common/utils/money.util'
import { toPeriod } from '../../common/utils/date.util'
import { CompanyScopedRepository } from '../../common/company/company.repository'
import { InjectCompanyRepo } from '../../common/company/company-repo.decorator'
import { requireCompanyId } from '../../common/company/company-context'
import type { PageResult, PaginationQueryDto } from '../../common/dto/pagination.dto'
import type { SaveVoucherDto, VoucherEntryDto } from './dto/voucher.dto'

interface NormalizedEntry {
  summary: string
  accountId: string
  accountCode: string
  accountName: string
  partnerId: string | null
  departmentId: string | null
  projectId: string | null
  debit: number
  credit: number
  sort: number
}

@Injectable()
export class VouchersService {
  constructor(
    @InjectCompanyRepo(Voucher) private readonly voucherRepo: CompanyScopedRepository<Voucher>,
    @InjectCompanyRepo(VoucherEntry) private readonly entryRepo: CompanyScopedRepository<VoucherEntry>,
    @InjectCompanyRepo(Account) private readonly accountRepo: CompanyScopedRepository<Account>,
    @InjectCompanyRepo(Partner) private readonly partnerRepo: CompanyScopedRepository<Partner>,
    @InjectCompanyRepo(Department) private readonly deptRepo: CompanyScopedRepository<Department>,
    @InjectCompanyRepo(Project) private readonly projectRepo: CompanyScopedRepository<Project>,
    private readonly dataSource: DataSource,
  ) {}

  // ==================== 查询 ====================

  /** 分页查询凭证 */
  async findAll(
    query: PaginationQueryDto & {
      period?: number
      status?: string
      word?: string
      accountId?: string
      startPeriod?: number
      endPeriod?: number
    },
  ): Promise<PageResult<any>> {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20

    const qb = this.voucherRepo.createQueryBuilder('v')

    if (query.period) {
      qb.andWhere('v.period = :period', { period: query.period })
    }
    if (query.startPeriod && query.endPeriod) {
      qb.andWhere('v.period BETWEEN :startPeriod AND :endPeriod', {
        startPeriod: query.startPeriod,
        endPeriod: query.endPeriod,
      })
    }
    if (query.status) qb.andWhere('v.status = :status', { status: query.status })
    if (query.word) qb.andWhere('v.word = :word', { word: query.word })

    // 按分录条件过滤：用子查询筛选凭证，避免关联带来的重复行
    const companyId = requireCompanyId()
    if (query.accountId) {
      qb.andWhere(
        `v.id IN (SELECT e.voucher_id FROM fin_voucher_entry e
                  WHERE e.account_id = :accountId AND e.company_id = :companyId)`,
        { accountId: query.accountId, companyId },
      )
    }
    if (query.keyword) {
      const kw = `%${query.keyword}%`
      qb.andWhere(
        `(v.remark LIKE :kw
          OR v.id IN (SELECT e.voucher_id FROM fin_voucher_entry e
                      WHERE e.company_id = :companyId
                        AND (e.summary LIKE :kw OR e.account_name LIKE :kw OR e.account_code LIKE :kw)))`,
        { kw, companyId },
      )
    }

    const [list, total] = await qb
      .orderBy('v.voucherDate', 'DESC')
      .addOrderBy('v.word', 'ASC')
      .addOrderBy('v.voucherNo', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount()

    // 批量加载分录
    const entriesMap = await this.loadEntriesByVoucher(list.map((v) => v.id))

    return {
      list: list.map((v) => this.toVo(v, entriesMap.get(v.id) ?? [])),
      total,
      page,
      pageSize,
    }
  }

  /** 批量按凭证ID 加载分录 */
  private async loadEntriesByVoucher(voucherIds: string[]): Promise<Map<string, VoucherEntry[]>> {
    const result = new Map<string, VoucherEntry[]>()
    if (!voucherIds.length) return result
    const entries = await this.entryRepo
      .createQueryBuilder('e')
      .where('e.voucherId IN (:...ids)', { ids: voucherIds })
      .orderBy('e.sort', 'ASC')
      .getMany()
    for (const e of entries) {
      if (!result.has(e.voucherId)) result.set(e.voucherId, [])
      result.get(e.voucherId)!.push(e)
    }
    return result
  }

  /** 凭证详情（含分录与辅助核算名称） */
  async findOne(id: string): Promise<any> {
    const voucher = await this.voucherRepo.findOne({ where: { id } })
    if (!voucher) throw new NotFoundException('凭证不存在')

    const entries = await this.entryRepo.find({
      where: { voucherId: id },
      order: { sort: 'ASC' },
    })
    const { partnerMap, deptMap, projectMap } = await this.loadAuxNames(entries)

    return {
      ...this.toVo(voucher, entries),
      entries: entries.map((e) => ({
        id: e.id,
        summary: e.summary,
        accountId: e.accountId,
        accountCode: e.accountCode,
        accountName: e.accountName,
        partnerId: e.partnerId,
        partnerName: partnerMap.get(e.partnerId) ?? null,
        departmentId: e.departmentId,
        departmentName: deptMap.get(e.departmentId) ?? null,
        projectId: e.projectId,
        projectName: projectMap.get(e.projectId) ?? null,
        debit: e.debit,
        credit: e.credit,
        sort: e.sort,
      })),
    }
  }

  /** 下一个可用凭证号 */
  async getNextVoucherNo(period: number, word = '记'): Promise<number> {
    const max = await this.voucherRepo
      .createQueryBuilder('v')
      .select('MAX(v.voucherNo)', 'max')
      .where('v.period = :period', { period })
      .andWhere('v.word = :word', { word })
      .getRawOne<{ max: number | null }>()
    return (max?.max ?? 0) + 1
  }

  // ==================== 复制 / 红冲 ====================

  /**
   * 复制凭证：返回可直接用于新建的草稿数据（不落库）
   */
  async copyPayload(id: string): Promise<any> {
    const detail = await this.findOne(id)
    return {
      word: detail.word,
      // 复制时使用今天作为凭证日期，避免误改原凭证期间
      voucherDate: new Date().toISOString().slice(0, 10),
      remark: detail.remark ? `（复制自 ${detail.word}-${String(detail.voucherNo).padStart(4, '0')}）${detail.remark}` : '',
      entries: (detail.entries ?? []).map((e: any) => ({
        summary: e.summary,
        accountId: e.accountId,
        partnerId: e.partnerId ?? undefined,
        departmentId: e.departmentId ?? undefined,
        projectId: e.projectId ?? undefined,
        debit: Number(e.debit ?? 0),
        credit: Number(e.credit ?? 0),
      })),
    }
  }

  /**
   * 红字冲销：生成一张借贷方向相反的已审核凭证，并双向关联
   */
  async reverse(
    id: string,
    dto: { reversalDate?: string; reason?: string },
    operator: { id: string; nickname: string },
  ): Promise<any> {
    const original = await this.voucherRepo.findOne({ where: { id } })
    if (!original) throw new NotFoundException('凭证不存在')

    if (original.status === VoucherStatus.DRAFT) {
      throw new BadRequestException('仅「已审核」的凭证可以红冲，草稿请直接删除或修改')
    }
    if (original.status === VoucherStatus.CANCELLED) {
      throw new BadRequestException('已作废凭证无需红冲')
    }
    if (original.isReversal) {
      throw new BadRequestException('红冲凭证不能再次红冲')
    }
    if (original.reversedById) {
      throw new BadRequestException('该凭证已被红冲，不可重复红冲')
    }

    const entries = await this.entryRepo.find({
      where: { voucherId: id },
      order: { sort: 'ASC' },
    })
    if (entries.length < 2) throw new BadRequestException('原凭证分录异常，无法红冲')

    const reversalDate = dto.reversalDate ?? new Date().toISOString().slice(0, 10)
    const originalLabel = `${original.word}-${String(original.voucherNo).padStart(4, '0')}`
    const reason = dto.reason ? `：${dto.reason}` : ''

    // 借贷方向整体对调，金额不变
    const reversed = await this.create(
      {
        word: original.word,
        voucherDate: reversalDate,
        entries: entries.map((e) => ({
          summary: e.summary ? `红冲 ${e.summary}` : '红字冲销',
          accountId: e.accountId,
          partnerId: e.partnerId ?? undefined,
          departmentId: e.departmentId ?? undefined,
          projectId: e.projectId ?? undefined,
          debit: Number(e.credit ?? 0),
          credit: Number(e.debit ?? 0),
        })),
        remark: `红字冲销 ${originalLabel} 号凭证${reason}`,
      },
      operator,
      true,
    )

    // 建立双向关联
    await this.voucherRepo.update({ id: reversed.id }, {
      isReversal: true,
      reversalOfId: id,
    })
    await this.voucherRepo.update({ id }, { reversedById: reversed.id })

    return {
      message: `已生成红字冲销凭证（${reversed.word}-${String(reversed.voucherNo).padStart(4, '0')}）`,
      original: await this.findOne(id),
      reversal: await this.findOne(reversed.id),
    }
  }

  // ==================== 写入 ====================

  /** 新增凭证 */
  async create(
    dto: SaveVoucherDto,
    operator: { id: string; nickname: string },
    autoApprove = false,
  ): Promise<any> {
    const period = toPeriod(dto.voucherDate)
    if (!period) throw new BadRequestException('凭证日期不合法')

    const entries = await this.normalizeEntries(dto.entries)
    const totals = this.sumEntries(entries)

    return this.dataSource.transaction(async (manager) => {
      const nextNo = await this.nextVoucherNoInTx(manager, period, dto.word)
      const companyId = requireCompanyId()
      const voucher = manager.create(Voucher, {
        companyId,
        voucherNo: nextNo,
        word: dto.word,
        period,
        voucherDate: dto.voucherDate.slice(0, 10),
        entryCount: entries.length,
        debitTotal: totals.debit,
        creditTotal: totals.credit,
        status: autoApprove ? VoucherStatus.APPROVED : VoucherStatus.DRAFT,
        attachments: dto.attachments ?? 0,
        remark: dto.remark ?? null,
        sourceType: VoucherSource.MANUAL,
        sourceId: null,
        createdBy: operator.id,
        createdByName: operator.nickname,
        approvedBy: autoApprove ? operator.id : null,
        approvedByName: autoApprove ? operator.nickname : null,
        approvedAt: autoApprove ? new Date() : null,
      })
      const savedVoucher = await manager.save(Voucher, voucher)

      const rows = entries.map((e) =>
        manager.create(VoucherEntry, { ...e, companyId, voucherId: savedVoucher.id }),
      )
      await manager.save(VoucherEntry, rows)

      return this.toVo(savedVoucher, rows)
    })
  }

  /** 编辑凭证（仅草稿可编辑） */
  async update(
    id: string,
    dto: SaveVoucherDto,
    operator: { id: string; nickname: string },
    autoApprove = false,
  ): Promise<any> {
    const voucher = await this.voucherRepo.findOne({ where: { id } })
    if (!voucher) throw new NotFoundException('凭证不存在')
    if (voucher.status === VoucherStatus.APPROVED) {
      throw new BadRequestException('凭证已审核，请先反审核后再修改')
    }
    if (voucher.status === VoucherStatus.CANCELLED) {
      throw new BadRequestException('已作废凭证不可修改')
    }
    void operator

    const period = toPeriod(dto.voucherDate)
    if (!period) throw new BadRequestException('凭证日期不合法')

    const entries = await this.normalizeEntries(dto.entries)
    const totals = this.sumEntries(entries)

    return this.dataSource.transaction(async (manager) => {
      let voucherNo = voucher.voucherNo
      if (period !== voucher.period || dto.word !== voucher.word) {
        voucherNo = await this.nextVoucherNoInTx(manager, period, dto.word)
      }

      await manager.delete(VoucherEntry, { voucherId: id })

      const rows = entries.map((e) =>
        manager.create(VoucherEntry, { ...e, companyId: requireCompanyId(), voucherId: id }),
      )
      await manager.save(VoucherEntry, rows)

      voucher.voucherNo = voucherNo
      voucher.word = dto.word
      voucher.period = period
      voucher.voucherDate = dto.voucherDate.slice(0, 10)
      voucher.entryCount = entries.length
      voucher.debitTotal = totals.debit
      voucher.creditTotal = totals.credit
      voucher.attachments = dto.attachments ?? 0
      voucher.remark = dto.remark ?? null
      if (autoApprove) {
        voucher.status = VoucherStatus.APPROVED
        voucher.approvedBy = operator.id
        voucher.approvedByName = operator.nickname
        voucher.approvedAt = new Date()
      }
      const saved = await manager.save(Voucher, voucher)
      return this.toVo(saved, rows)
    })
  }

  /** 删除凭证（仅草稿） */
  async remove(id: string): Promise<{ message: string }> {
    const voucher = await this.voucherRepo.findOne({ where: { id } })
    if (!voucher) throw new NotFoundException('凭证不存在')
    if (voucher.status === VoucherStatus.APPROVED) {
      throw new BadRequestException('已审核凭证不可删除，请先反审核')
    }
    await this.entryRepo.delete({ voucherId: id })
    await this.voucherRepo.delete({ id } as any)
    return { message: '删除成功' }
  }

  /** 审核 */
  async approve(id: string, operator: { id: string; nickname: string }): Promise<any> {
    const voucher = await this.voucherRepo.findOne({ where: { id } })
    if (!voucher) throw new NotFoundException('凭证不存在')
    if (voucher.status === VoucherStatus.APPROVED) {
      throw new BadRequestException('该凭证已审核')
    }
    if (voucher.status === VoucherStatus.CANCELLED) {
      throw new BadRequestException('已作废凭证不可审核')
    }

    // 审核前再次校验借贷平衡，防止历史数据异常
    const entries = await this.entryRepo.find({ where: { voucherId: id } })
    if (entries.length < 2) throw new BadRequestException('凭证分录不足两条，不能审核')
    const totals = this.sumEntries(entries)
    if (totals.debit !== totals.credit) {
      throw new BadRequestException('借贷不平衡，不能审核')
    }

    voucher.status = VoucherStatus.APPROVED
    voucher.approvedBy = operator.id
    voucher.approvedByName = operator.nickname
    voucher.approvedAt = new Date()
    const saved = await this.voucherRepo.save(voucher)
    return this.toVo(saved)
  }

  /** 反审核 */
  async unapprove(id: string): Promise<any> {
    const voucher = await this.voucherRepo.findOne({ where: { id } })
    if (!voucher) throw new NotFoundException('凭证不存在')
    if (voucher.status !== VoucherStatus.APPROVED) {
      throw new BadRequestException('仅已审核凭证可以反审核')
    }
    voucher.status = VoucherStatus.DRAFT
    voucher.approvedBy = null
    voucher.approvedByName = null
    voucher.approvedAt = null
    const saved = await this.voucherRepo.save(voucher)
    return this.toVo(saved)
  }

  /** 作废 */
  async cancel(id: string, reason?: string): Promise<any> {
    const voucher = await this.voucherRepo.findOne({ where: { id } })
    if (!voucher) throw new NotFoundException('凭证不存在')
    if (voucher.status === VoucherStatus.CANCELLED) {
      throw new BadRequestException('该凭证已作废')
    }
    voucher.status = VoucherStatus.CANCELLED
    voucher.remark = reason ? `${voucher.remark ?? ''}（作废原因：${reason}）`.trim() : voucher.remark
    const saved = await this.voucherRepo.save(voucher)
    return this.toVo(saved)
  }

  /**
   * 由其他模块（现金银行 / 往来核销 / 其他收支）创建凭证
   */
  async createFromSystem(
    params: {
      word: string
      voucherDate: string
      entries: VoucherEntryDto[]
      remark?: string
      sourceType: VoucherSource
      sourceId: string
      autoApprove?: boolean
    },
    operator: { id: string; nickname: string },
  ): Promise<Voucher> {
    return this.create(
      {
        word: params.word,
        voucherDate: params.voucherDate,
        entries: params.entries,
        remark: params.remark,
      },
      operator,
      params.autoApprove ?? true,
    ) as Promise<any>
  }

  // ==================== 内部方法 ====================

  private async nextVoucherNoInTx(
    manager: EntityManager,
    period: number,
    word: string,
  ): Promise<number> {
    const row = await manager
      .createQueryBuilder(Voucher, 'v')
      .select('MAX(v.voucherNo)', 'max')
      .where('v.period = :period', { period })
      .andWhere('v.word = :word', { word })
      .andWhere('v.company_id = :companyId', { companyId: requireCompanyId() })
      .getRawOne<{ max: number | null }>()
    return (row?.max ?? 0) + 1
  }

  /**
   * 校验并规范化分录：借贷平衡、科目可用性、辅助核算必填
   */
  private async normalizeEntries(raw: VoucherEntryDto[]): Promise<NormalizedEntry[]> {
    const effective = raw.filter((e) => toCents(e.debit) !== 0 || toCents(e.credit) !== 0)
    if (effective.length < 2) {
      throw new BadRequestException('记账凭证至少需要两条有效分录（金额不为 0）')
    }

    const accountIds = Array.from(new Set(effective.map((e) => e.accountId)))
    const accounts = await this.accountRepo
      .createQueryBuilder('a')
      .where('a.id IN (:...ids)', { ids: accountIds })
      .getMany()
    const accountMap = new Map(accounts.map((a) => [a.id, a]))

    const partnerIds = effective.map((e) => e.partnerId).filter(Boolean) as string[]
    const deptIds = effective.map((e) => e.departmentId).filter(Boolean) as string[]
    const projectIds = effective.map((e) => e.projectId).filter(Boolean) as string[]

    const [partners, depts, projects] = await Promise.all([
      partnerIds.length
        ? this.partnerRepo.createQueryBuilder('p').where('p.id IN (:...ids)', { ids: partnerIds }).getMany()
        : Promise.resolve([]),
      deptIds.length
        ? this.deptRepo.createQueryBuilder('d').where('d.id IN (:...ids)', { ids: deptIds }).getMany()
        : Promise.resolve([]),
      projectIds.length
        ? this.projectRepo.createQueryBuilder('pr').where('pr.id IN (:...ids)', { ids: projectIds }).getMany()
        : Promise.resolve([]),
    ])
    const partnerSet = new Set(partners.map((p) => p.id))
    const deptSet = new Set(depts.map((d) => d.id))
    const projectSet = new Set(projects.map((p) => p.id))

    const entries: NormalizedEntry[] = []
    let debit = 0
    let credit = 0

    effective.forEach((e, index) => {
      const rowNo = index + 1
      const account = accountMap.get(e.accountId)
      if (!account) throw new BadRequestException(`第 ${rowNo} 行：会计科目不存在`)
      if (account.status !== 1) {
        throw new BadRequestException(`第 ${rowNo} 行：科目「${account.fullName}」已禁用`)
      }
      if (!account.isLeaf) {
        throw new BadRequestException(`第 ${rowNo} 行：科目「${account.fullName}」不是明细科目，不能记账`)
      }

      const d = toCents(e.debit)
      const c = toCents(e.credit)
      if (d > 0 && c > 0) {
        throw new BadRequestException(`第 ${rowNo} 行：借方与贷方不能同时有金额`)
      }
      if (d === 0 && c === 0) {
        throw new BadRequestException(`第 ${rowNo} 行：请填写借方或贷方金额`)
      }

      const types: string[] = (account.auxiliaryTypes ?? []) as unknown as string[]
      if (types.includes('partner') && !e.partnerId) {
        throw new BadRequestException(`第 ${rowNo} 行：科目「${account.fullName}」需指定往来单位`)
      }
      if (types.includes('department') && !e.departmentId) {
        throw new BadRequestException(`第 ${rowNo} 行：科目「${account.fullName}」需指定部门`)
      }
      if (types.includes('project') && !e.projectId) {
        throw new BadRequestException(`第 ${rowNo} 行：科目「${account.fullName}」需指定项目`)
      }
      if (e.partnerId && !partnerSet.has(e.partnerId)) {
        throw new BadRequestException(`第 ${rowNo} 行：往来单位不存在`)
      }
      if (e.departmentId && !deptSet.has(e.departmentId)) {
        throw new BadRequestException(`第 ${rowNo} 行：部门不存在`)
      }
      if (e.projectId && !projectSet.has(e.projectId)) {
        throw new BadRequestException(`第 ${rowNo} 行：项目不存在`)
      }

      debit += d
      credit += c
      entries.push({
        summary: (e.summary ?? '').trim(),
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        partnerId: e.partnerId || null,
        departmentId: e.departmentId || null,
        projectId: e.projectId || null,
        debit: fromCents(d),
        credit: fromCents(c),
        sort: rowNo,
      })
    })

    if (debit === 0) throw new BadRequestException('借方合计不能为 0')
    if (debit !== credit) {
      throw new BadRequestException(
        `借贷不平衡：借方合计 ${fromCents(debit).toFixed(2)}，贷方合计 ${fromCents(credit).toFixed(2)}，差额 ${fromCents(Math.abs(debit - credit)).toFixed(2)}`,
      )
    }

    return entries
  }

  /** 汇总分录金额（分级比较，避免浮点误差） */
  private sumEntries(entries: Array<{ debit: number; credit: number }>): {
    debit: number
    credit: number
  } {
    let debit = 0
    let credit = 0
    for (const e of entries) {
      debit += toCents(e.debit)
      credit += toCents(e.credit)
    }
    return { debit: fromCents(debit), credit: fromCents(credit) }
  }

  private async loadAuxNames(entries: VoucherEntry[]): Promise<{
    partnerMap: Map<string, string>
    deptMap: Map<string, string>
    projectMap: Map<string, string>
  }> {
    const partnerIds = entries.map((e) => e.partnerId).filter(Boolean) as string[]
    const deptIds = entries.map((e) => e.departmentId).filter(Boolean) as string[]
    const projectIds = entries.map((e) => e.projectId).filter(Boolean) as string[]

    const [partners, depts, projects] = await Promise.all([
      partnerIds.length ? this.partnerRepo.find({ where: { id: In(partnerIds) } }) : Promise.resolve([]),
      deptIds.length ? this.deptRepo.find({ where: { id: In(deptIds) } }) : Promise.resolve([]),
      projectIds.length ? this.projectRepo.find({ where: { id: In(projectIds) } }) : Promise.resolve([]),
    ])

    return {
      partnerMap: new Map(partners.map((p) => [p.id, p.name])),
      deptMap: new Map(depts.map((d) => [d.id, d.name])),
      projectMap: new Map(projects.map((p) => [p.id, p.name])),
    }
  }

  private toVo(voucher: Voucher, entries: VoucherEntry[] = []): any {
    return {
      id: voucher.id,
      voucherNo: voucher.voucherNo,
      word: voucher.word,
      period: voucher.period,
      voucherDate: voucher.voucherDate,
      entryCount: voucher.entryCount,
      debitTotal: voucher.debitTotal,
      creditTotal: voucher.creditTotal,
      status: voucher.status,
      isReversal: voucher.isReversal ?? false,
      reversalOfId: voucher.reversalOfId ?? null,
      reversedById: voucher.reversedById ?? null,
      attachments: voucher.attachments,
      remark: voucher.remark,
      sourceType: voucher.sourceType,
      sourceId: voucher.sourceId,
      createdByName: voucher.createdByName,
      approvedByName: voucher.approvedByName,
      approvedAt: voucher.approvedAt,
      createdAt: voucher.createdAt,
      updatedAt: voucher.updatedAt,
      entries: entries.map((e) => ({
        id: e.id,
        summary: e.summary,
        accountId: e.accountId,
        accountCode: e.accountCode,
        accountName: e.accountName,
        partnerId: e.partnerId,
        departmentId: e.departmentId,
        projectId: e.projectId,
        debit: e.debit,
        credit: e.credit,
        sort: e.sort,
      })),
    }
  }
}