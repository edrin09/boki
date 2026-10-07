import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Project } from '../../entities/project.entity'
import { VoucherEntry } from '../../entities/voucher-entry.entity'
import { InitialBalance } from '../../entities/initial-balance.entity'
import { CODE_PREFIX, nextCode } from '../../common/utils/code.util'
import type { PageResult, PaginationQueryDto } from '../../common/dto/pagination.dto'
import type { CreateProjectDto, UpdateProjectDto } from './dto/project.dto'

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project) private readonly repo: Repository<Project>,
    @InjectRepository(VoucherEntry) private readonly entryRepo: Repository<VoucherEntry>,
    @InjectRepository(InitialBalance)
    private readonly initialBalanceRepo: Repository<InitialBalance>,
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
    if (dto.startDate !== undefined) entity.startDate = dto.startDate || null
    if (dto.endDate !== undefined) entity.endDate = dto.endDate || null
    if (dto.remark !== undefined) entity.remark = dto.remark || null
    if (dto.status !== undefined) entity.status = dto.status
    return this.repo.save(entity)
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
    await this.repo.delete(id)
    return { message: '删除成功' }
  }
}