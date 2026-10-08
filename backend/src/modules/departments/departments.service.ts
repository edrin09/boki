import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Department } from '../../entities/department.entity'
import { VoucherEntry } from '../../entities/voucher-entry.entity'
import { InitialBalance } from '../../entities/initial-balance.entity'
import { buildTree, collectDescendantIds, sortTree } from '../../common/utils/tree.util'
import { CODE_PREFIX, nextCode } from '../../common/utils/code.util'
import { CompanyScopedRepository } from '../../common/company/company.repository'
import { InjectCompanyRepo } from '../../common/company/company-repo.decorator'
import type { CreateDepartmentDto, UpdateDepartmentDto } from './dto/department.dto'

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectCompanyRepo(Department) private readonly repo: CompanyScopedRepository<Department>,
    @InjectCompanyRepo(VoucherEntry) private readonly entryRepo: CompanyScopedRepository<VoucherEntry>,
    @InjectCompanyRepo(InitialBalance)
    private readonly initialBalanceRepo: CompanyScopedRepository<InitialBalance>,
  ) {}

  async findAll(keyword?: string): Promise<Department[]> {
    const qb = this.repo.createQueryBuilder('d')
    if (keyword) {
      qb.where('(d.code LIKE :kw OR d.name LIKE :kw)', { kw: `%${keyword}%` })
    }
    return qb.orderBy('d.code', 'ASC').getMany()
  }

  async findTree(keyword?: string): Promise<any[]> {
    const list = await this.findAll(keyword)
    return sortTree(buildTree(list))
  }

  async findOptions(): Promise<any[]> {
    const list = await this.repo.find({ where: { status: 1 }, order: { code: 'ASC' } })
    return list.map((d) => ({ id: d.id, code: d.code, name: d.name }))
  }

  async findOne(id: string): Promise<Department> {
    const entity = await this.repo.findOne({ where: { id } })
    if (!entity) throw new NotFoundException('部门不存在')
    return entity
  }

  /** 预览下一个可用编码 */
  async getNextCode(): Promise<string> {
    return nextCode(this.repo, CODE_PREFIX.department)
  }

  async create(dto: CreateDepartmentDto): Promise<Department> {
    const code = (dto.code ?? '').trim() || (await this.getNextCode())
    const exists = await this.repo.findOne({ where: { code } })
    if (exists) throw new ConflictException(`部门编码「${code}」已存在`)
    if (dto.parentId) await this.findOne(dto.parentId)

    const entity = this.repo.create({
      code,
      name: dto.name,
      parentId: dto.parentId ?? null,
      manager: dto.manager ?? null,
      remark: dto.remark ?? null,
      status: 1,
    })
    return this.repo.save(entity)
  }

  async update(id: string, dto: UpdateDepartmentDto): Promise<Department> {
    const entity = await this.findOne(id)
    if (dto.parentId !== undefined) {
      if (dto.parentId === id) throw new ConflictException('上级部门不能是自己')
      if (dto.parentId) {
        const parent = await this.findOne(dto.parentId)
        const all = await this.repo.find()
        if (collectDescendantIds(all, id).has(parent.id)) {
          throw new ConflictException('不能将部门移动到自己的下级部门下')
        }
      }
      entity.parentId = dto.parentId || null
    }
    if (dto.name !== undefined) entity.name = dto.name
    if (dto.manager !== undefined) entity.manager = dto.manager || null
    if (dto.remark !== undefined) entity.remark = dto.remark || null
    if (dto.status !== undefined) entity.status = dto.status
    return this.repo.save(entity)
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.findOne(id)
    const all = await this.repo.find()
    if (collectDescendantIds(all, id).size > 0) {
      throw new ConflictException('请先删除下级部门后再删除当前部门')
    }
    const usedEntries = await this.entryRepo.count({ where: { departmentId: id } })
    if (usedEntries > 0) {
      throw new ConflictException(`该部门已被 ${usedEntries} 条凭证分录引用，无法删除`)
    }
    const usedInitial = await this.initialBalanceRepo.count({ where: { departmentId: id } })
    if (usedInitial > 0) {
      throw new ConflictException('该部门已录入期初余额，无法删除')
    }
    await this.repo.delete({ id } as any)
    return { message: '删除成功' }
  }
}