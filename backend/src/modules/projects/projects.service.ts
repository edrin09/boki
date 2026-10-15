import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Project } from '../../entities/project.entity'
import { VoucherEntry } from '../../entities/voucher-entry.entity'
import { InitialBalance } from '../../entities/initial-balance.entity'
import { parseContractPdf } from './contract-parser'
import { OcrEngine } from '../ocr/ocr.engine'
import { CODE_PREFIX, nextCode } from '../../common/utils/code.util'
import { CompanyScopedRepository } from '../../common/company/company.repository'
import { InjectCompanyRepo } from '../../common/company/company-repo.decorator'
import type { PageResult, PaginationQueryDto } from '../../common/dto/pagination.dto'
import type { CreateProjectDto, UpdateProjectDto } from './dto/project.dto'

@Injectable()
export class ProjectsService {
  constructor(
    @InjectCompanyRepo(Project) private readonly repo: CompanyScopedRepository<Project>,
    @InjectCompanyRepo(VoucherEntry) private readonly entryRepo: CompanyScopedRepository<VoucherEntry>,
    @InjectCompanyRepo(InitialBalance)
    private readonly initialBalanceRepo: CompanyScopedRepository<InitialBalance>,
    private readonly ocrEngine: OcrEngine,
  ) {}

  async findAll(query: PaginationQueryDto): Promise<PageResult<any>> {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const qb = this.repo.createQueryBuilder('p')

    if (query.keyword) {
      qb.where('(p.code LIKE :kw OR p.name LIKE :kw)', { kw: `%${query.keyword}%` })
    }

    const [list, total] = await qb
      .orderBy('p.code', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount()

    return { list, total, page, pageSize }
  }

  async findOptions(): Promise<any[]> {
    const list = await this.repo.find({ where: { status: 1 }, order: { code: 'ASC' } })
    return list.map((p) => ({ id: p.id, code: p.code, name: p.name }))
  }

  async findOne(id: string): Promise<Project> {
    const entity = await this.repo.findOne({ where: { id } })
    if (!entity) throw new NotFoundException('项目不存在')
    return entity
  }

  /** 预览下一个可用编码 */
  async getNextCode(): Promise<string> {
    return nextCode(this.repo, CODE_PREFIX.project)
  }

  async create(dto: CreateProjectDto): Promise<Project> {
    const code = (dto.code ?? '').trim() || (await this.getNextCode())
    const exists = await this.repo.findOne({ where: { code } })
    if (exists) throw new ConflictException(`项目编码「${code}」已存在`)
    const entity = this.repo.create({
      code,
      name: dto.name,
      manager: dto.manager ?? null,
      contractNo: dto.contractNo ?? null,
      contractAmount: dto.contractAmount ?? 0,
      partnerId: dto.partnerId ?? null,
      startDate: dto.startDate ?? null,
      endDate: dto.endDate ?? null,
      remark: dto.remark ?? null,
      status: 1,
    })
    return this.repo.save(entity)
  }

  async update(id: string, dto: UpdateProjectDto): Promise<Project> {
    const entity = await this.findOne(id)
    if (dto.name !== undefined) entity.name = dto.name
    if (dto.manager !== undefined) entity.manager = dto.manager || null
    if (dto.contractNo !== undefined) entity.contractNo = dto.contractNo || null
    if (dto.contractAmount !== undefined) entity.contractAmount = dto.contractAmount || 0
    if (dto.partnerId !== undefined) entity.partnerId = dto.partnerId || null
    if (dto.startDate !== undefined) entity.startDate = dto.startDate || null
    if (dto.endDate !== undefined) entity.endDate = dto.endDate || null
    if (dto.remark !== undefined) entity.remark = dto.remark || null
    if (dto.status !== undefined) entity.status = dto.status
    return this.repo.save(entity)
  }

  /**
   * 项目合同台账：按项目聚合 预收账款(2203)/应收账款(1122)/已确认收入(6001)
   * 尾款 = 合同金额 − 预收 − 应收 − 已确认收入
   */
  async ledger(): Promise<any[]> {
    const projects = await this.repo.find({ order: { code: 'ASC' } })
    if (projects.length === 0) return []

    const rows = await this.entryRepo
      .createQueryBuilder('e')
      .innerJoin('fin_voucher', 'v', 'v.id = e.voucher_id')
      .select('e.project_id', 'projectId')
      .addSelect('e.account_code', 'code')
      .addSelect(
        `CASE WHEN e.account_code IN ('2203','6001') THEN SUM(e.credit - e.debit) ELSE SUM(e.debit - e.credit) END`,
        'bal',
      )
      .where('e.project_id IS NOT NULL')
      .andWhere('e.account_code IN (:...codes)', { codes: ['2203', '1122', '6001'] })
      .andWhere('v.status = :st', { st: 'approved' })
      .groupBy('e.project_id')
      .addGroupBy('e.account_code')
      .getRawMany()

    // partner 名称
    const partnerIds = [...new Set(projects.map((p) => p.partnerId).filter(Boolean))] as string[]
    const partners = partnerIds.length
      ? await this.repo.manager.query(
          `SELECT id, name FROM fin_partner WHERE id IN (${partnerIds.map(() => '?').join(',')})`,
          partnerIds,
        )
      : []

    const agg = new Map<string, Record<string, number>>()
    for (const r of rows) {
      const m = agg.get(r.projectId) ?? {}
      m[r.code] = Math.round((Number(r.bal) + Number.EPSILON) * 100) / 100
      agg.set(r.projectId, m)
    }
    const pName = new Map<string, string>(partners.map((p: any) => [p.id, p.name]))

    return projects.map((p) => {
      const m = agg.get(p.id) ?? {}
      const contract = Number(p.contractAmount ?? 0)
      const advance = m['2203'] ?? 0
      const receivable = m['1122'] ?? 0
      const revenue = m['6001'] ?? 0
      const rest = Math.round((contract - advance - receivable - revenue) * 100) / 100
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        contractNo: p.contractNo,
        contractAmount: contract,
        partnerId: p.partnerId,
        partnerName: p.partnerId ? pName.get(p.partnerId) ?? null : null,
        advanceReceived: advance,
        receivable,
        recognizedRevenue: revenue,
        restAmount: rest,
      }
    })
  }

  /** 解析合同 PDF，返回关键字段识别建议（用户确认后保存）。扫描件自动走 OCR */
  async parseContract(buffer: Buffer) {
    return parseContractPdf(buffer, this.ocrEngine)
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.findOne(id)
    const usedEntries = await this.entryRepo.count({ where: { projectId: id } })
    if (usedEntries > 0) {
      throw new ConflictException(`该项目已被 ${usedEntries} 条凭证分录引用，无法删除`)
    }
    const usedInitial = await this.initialBalanceRepo.count({ where: { projectId: id } })
    if (usedInitial > 0) {
      throw new ConflictException('该项目已录入期初余额，无法删除')
    }
    await this.repo.delete({ id } as any)
    return { message: '删除成功' }
  }
}