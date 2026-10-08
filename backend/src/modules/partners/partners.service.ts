import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm'
import { Partner } from '../../entities/partner.entity'
import { VoucherEntry } from '../../entities/voucher-entry.entity'
import { InitialBalance } from '../../entities/initial-balance.entity'
import { PartnerType } from '../../common/enums'
import { CODE_PREFIX, nextCode } from '../../common/utils/code.util'
import { CompanyScopedRepository } from '../../common/company/company.repository'
import { InjectCompanyRepo } from '../../common/company/company-repo.decorator'
import type { PageResult, PaginationQueryDto } from '../../common/dto/pagination.dto'
import type { CreatePartnerDto, UpdatePartnerDto } from './dto/partner.dto'

/** 纳税人识别号归一化：去空白 + 大写（同一机构只允许一条记录） */
function normalizeTaxNo(value?: string | null): string | null {
  const t = (value ?? '').trim().toUpperCase().replace(/[\s\u3000]+/g, '')
  return t || null
}

export interface BatchCreateItemResult {
  index: number
  success: boolean
  id?: string
  code?: string
  name?: string
  message?: string
}

@Injectable()
export class PartnersService {
  constructor(
    @InjectCompanyRepo(Partner) private readonly repo: CompanyScopedRepository<Partner>,
    @InjectCompanyRepo(VoucherEntry) private readonly entryRepo: CompanyScopedRepository<VoucherEntry>,
    @InjectCompanyRepo(InitialBalance)
    private readonly initialBalanceRepo: CompanyScopedRepository<InitialBalance>,
  ) {}

  async findAll(query: PaginationQueryDto & { type?: string }): Promise<PageResult<any>> {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const qb = this.repo.createQueryBuilder('p')

    if (query.keyword) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('p.code LIKE :kw', { kw: `%${query.keyword}%` })
            .orWhere('p.name LIKE :kw', { kw: `%${query.keyword}%` })
            .orWhere('p.contact LIKE :kw', { kw: `%${query.keyword}%` })
            .orWhere('p.phone LIKE :kw', { kw: `%${query.keyword}%` })
        }),
      )
    }
    if (query.type) qb.andWhere('p.type = :type', { type: query.type })

    const [list, total] = await qb
      .orderBy('p.code', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount()

    return { list, total, page, pageSize }
  }

  async findOptions(type?: string): Promise<any[]> {
    const list = await this.repo.find({ where: { status: 1 }, order: { code: 'ASC' } })
    const filtered = type ? list.filter((p) => p.type === type || p.type === 'both') : list
    return filtered.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      type: p.type,
    }))
  }

  async findOne(id: string): Promise<Partner> {
    const partner = await this.repo.findOne({ where: { id } })
    if (!partner) throw new NotFoundException('往来单位不存在')
    return partner
  }

  /** 预览下一个可用编码 */
  async getNextCode(): Promise<string> {
    return nextCode(this.repo, CODE_PREFIX.partner)
  }

  async create(dto: CreatePartnerDto): Promise<Partner> {
    const code = (dto.code ?? '').trim() || (await this.getNextCode())
    const exists = await this.repo.findOne({ where: { code } })
    if (exists) throw new ConflictException(`编码「${code}」已存在`)
    const taxNo = normalizeTaxNo(dto.taxNo)
    if (taxNo) {
      const dup = await this.repo.findOne({ where: { taxNo } })
      if (dup) {
        throw new ConflictException(`纳税人识别号「${taxNo}」已存在（${dup.name}），请勿重复建档`)
      }
    }
    const entity = this.repo.create({
      code,
      name: dto.name,
      type: (dto.type ?? 'customer') as PartnerType,
      contact: dto.contact ?? null,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      address: dto.address ?? null,
      taxNo,
      legalPerson: dto.legalPerson ?? null,
      bankName: dto.bankName ?? null,
      bankAccount: dto.bankAccount ?? null,
      remark: dto.remark ?? null,
      status: 1,
    })
    return this.repo.save(entity)
  }

  /** 批量新增：逐条独立入库，返回每条结果（部分失败不影响其他行） */
  async createBatch(items: CreatePartnerDto[]): Promise<{
    created: number
    failed: number
    results: BatchCreateItemResult[]
  }> {
    const results: BatchCreateItemResult[] = []
    for (let index = 0; index < items.length; index++) {
      const dto = items[index]
      try {
        const saved = await this.create(dto)
        results.push({ index, success: true, id: saved.id, code: saved.code, name: saved.name })
      } catch (err) {
        results.push({ index, success: false, name: dto.name, message: (err as Error).message })
      }
    }
    const created = results.filter((r) => r.success).length
    return { created, failed: results.length - created, results }
  }

  async update(id: string, dto: UpdatePartnerDto): Promise<Partner> {
    const partner = await this.findOne(id)
    if (dto.name !== undefined) partner.name = dto.name
    if (dto.type !== undefined) partner.type = dto.type as PartnerType
    if (dto.contact !== undefined) partner.contact = dto.contact || null
    if (dto.phone !== undefined) partner.phone = dto.phone || null
    if (dto.email !== undefined) partner.email = dto.email || null
    if (dto.address !== undefined) partner.address = dto.address || null
    if (dto.taxNo !== undefined) {
      const taxNo = normalizeTaxNo(dto.taxNo)
      if (taxNo) {
        const dup = await this.repo.findOne({ where: { taxNo } })
        if (dup && dup.id !== id) {
          throw new ConflictException(`纳税人识别号「${taxNo}」已存在（${dup.name}），请勿重复建档`)
        }
      }
      partner.taxNo = taxNo
    }
    if (dto.legalPerson !== undefined) partner.legalPerson = dto.legalPerson || null
    if (dto.bankName !== undefined) partner.bankName = dto.bankName || null
    if (dto.bankAccount !== undefined) partner.bankAccount = dto.bankAccount || null
    if (dto.remark !== undefined) partner.remark = dto.remark || null
    if (dto.status !== undefined) partner.status = dto.status
    return this.repo.save(partner)
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.findOne(id)
    const usedEntries = await this.entryRepo.count({ where: { partnerId: id } })
    if (usedEntries > 0) {
      throw new ConflictException(`该往来单位已被 ${usedEntries} 条凭证分录引用，无法删除。可改为「禁用」`)
    }
    const usedInitial = await this.initialBalanceRepo.count({ where: { partnerId: id } })
    if (usedInitial > 0) {
      throw new ConflictException('该往来单位已录入期初余额，无法删除')
    }
    await this.repo.delete({ id } as any)
    return { message: '删除成功' }
  }
}