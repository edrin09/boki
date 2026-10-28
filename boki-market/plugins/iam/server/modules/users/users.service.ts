import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, In, Repository } from 'typeorm'
import { User } from '@core/entities/user.entity'
import { UserCompany } from '@core/entities/user-company.entity'
import { Company } from '@core/entities/company.entity'
import { Role } from '@core/entities/role.entity'
import { hashPassword } from '@core/common/utils/crypto.util'
import type { PageResult, PaginationQueryDto } from '@core/common/dto/pagination.dto'
import type {
  CreateUserDto,
  ResetPasswordDto,
  UpdateUserDto,
} from './dto/user.dto'

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(UserCompany) private readonly linkRepo: Repository<UserCompany>,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
  ) {}

  /** 分页查询用户 */
  async findAll(query: PaginationQueryDto): Promise<PageResult<any>> {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20

    const qb = this.userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.roles', 'roles')
      .skip((page - 1) * pageSize)
      .take(pageSize)

    if (query.keyword) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('u.username LIKE :kw', { kw: `%${query.keyword}%` })
            .orWhere('u.nickname LIKE :kw', { kw: `%${query.keyword}%` })
            .orWhere('u.phone LIKE :kw', { kw: `%${query.keyword}%` })
        }),
      )
    }

    const order = (query.sortOrder ?? 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
    const allowedSort = ['createdAt', 'username', 'nickname', 'lastLoginAt']
    const sortBy = allowedSort.includes(query.sortBy ?? '') ? query.sortBy! : 'createdAt'
    qb.orderBy(`u.${sortBy}`, order)

    const [list, total] = await qb.getManyAndCount()
    const access = await this.companyAccessMap(list.map((u) => u.id))
    return {
      list: list.map((u) => {
        const acc = access.get(u.id) ?? { companyIds: [], companyNames: [] }
        return this.toVo(u, acc.companyIds, acc.companyNames)
      }),
      total,
      page,
      pageSize,
    }
  }

  /** 查询全部用户（下拉选项） */
  async findAllOptions(): Promise<any[]> {
    const users = await this.userRepo.find({ order: { nickname: 'ASC' } })
    return users.map((u) => ({ id: u.id, username: u.username, nickname: u.nickname }))
  }

  /** 详情 */
  async findOne(id: string): Promise<any> {
    const user = await this.getEntity(id)
    const acc = await this.companyAccessOf(user.id)
    return this.toVo(user, acc.companyIds, acc.companyNames)
  }

  /** 新增用户 */
  async create(dto: CreateUserDto): Promise<any> {
    const exists = await this.userRepo.findOne({ where: { username: dto.username } })
    if (exists) throw new ConflictException(`账号「${dto.username}」已存在`)

    const roles = await this.resolveRoles(dto.roleIds)
    const user = this.userRepo.create({
      username: dto.username,
      nickname: dto.nickname,
      password: await hashPassword(dto.password),
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      status: dto.status ?? 1,
      remark: dto.remark ?? null,
      roles,
    })
    const saved = await this.userRepo.save(user)
    if (dto.companyIds?.length) {
      await this.linkCompanies(saved.id, dto.companyIds)
    }
    const acc = await this.companyAccessOf(saved.id)
    return this.toVo(saved, acc.companyIds, acc.companyNames)
  }

  /** 编辑用户 */
  async update(id: string, dto: UpdateUserDto): Promise<any> {
    const user = await this.getEntity(id)

    if (dto.nickname !== undefined) user.nickname = dto.nickname
    if (dto.email !== undefined) user.email = dto.email || null
    if (dto.phone !== undefined) user.phone = dto.phone || null
    if (dto.remark !== undefined) user.remark = dto.remark || null
    if (dto.status !== undefined) {
      if (dto.status === 0) await this.assertNotDisableAdmin(user)
      user.status = dto.status
    }
    if (dto.roleIds) {
      user.roles = await this.resolveRoles(dto.roleIds)
    }
    if (Array.isArray(dto.companyIds)) {
      const current = (
        await this.linkRepo.find({ where: { userId: id, status: 1 } })
      ).map((l) => l.companyId)
      const target = dto.companyIds
      const added = target.filter((c) => !current.includes(c))
      if (added.length) await this.linkCompanies(id, added)
      for (const companyId of current.filter((c) => !target.includes(c))) {
        await this.unlinkCompany(id, companyId)
      }
    }

    const saved = await this.userRepo.save(user)
    const acc = await this.companyAccessOf(saved.id)
    return this.toVo(saved, acc.companyIds, acc.companyNames)
  }

  /** 修改状态 */
  async updateStatus(id: string, status: number): Promise<any> {
    const user = await this.getEntity(id)
    if (status === 0) await this.assertNotDisableAdmin(user)
    user.status = status
    const saved = await this.userRepo.save(user)
    return this.toVo(saved)
  }

  /** 删除用户 */
  async remove(id: string): Promise<{ message: string }> {
    const user = await this.getEntity(id)
    await this.assertNotDeleteAdmin(user)
    await this.userRepo.delete(id)
    return { message: '删除成功' }
  }

  /** 重置密码 */
  async resetPassword(id: string, dto: ResetPasswordDto): Promise<{ message: string }> {
    const user = await this.getEntity(id)
    await this.userRepo.update(id, { password: await hashPassword(dto.password) })
    return { message: `已重置「${user.nickname}」的密码` }
  }

  /** 分配角色 */
  async assignRoles(id: string, roleIds: string[]): Promise<any> {
    const user = await this.getEntity(id)
    user.roles = await this.resolveRoles(roleIds)
    const saved = await this.userRepo.save(user)
    return this.toVo(saved)
  }

  // ==================== 私有方法 ====================

  /**
   * 为用户开通若干公司的访问权（幂等）。
   *
   * iam 不依赖多公司插件：公司成员关系存放于内核实体 `sys_user_company`，
   * 这里直接按内核语义写入，保证「拔掉 multi-company 插件后用户管理仍可用」。
   */
  private async linkCompanies(userId: string, companyIds: string[]): Promise<void> {
    const ids = [...new Set(companyIds)]
    if (!ids.length) return

    const found = await this.companyRepo.count({ where: { id: In(ids) } })
    if (found !== ids.length) throw new BadRequestException('存在无效的记账公司')

    const links = await this.linkRepo.find({ where: { userId, companyId: In(ids) } })
    const byCompany = new Map(links.map((l) => [l.companyId, l]))
    for (const companyId of ids) {
      const link = byCompany.get(companyId)
      if (link) {
        if (link.status !== 1) {
          link.status = 1
          await this.linkRepo.save(link)
        }
        continue
      }
      await this.linkRepo.save(
        this.linkRepo.create({ userId, companyId, isOwner: false, status: 1 }),
      )
    }
  }

  /** 取消用户对某公司的访问权（与内核 CompaniesService 的约束保持一致） */
  private async unlinkCompany(userId: string, companyId: string): Promise<void> {
    const link = await this.linkRepo.findOne({ where: { userId, companyId } })
    if (!link) return
    if (link.isOwner) throw new BadRequestException('不能移除公司所有者')
    const active = await this.linkRepo.count({ where: { companyId, status: 1 } })
    if (active <= 1) throw new BadRequestException('公司至少需要保留一个可访问用户')
    await this.linkRepo.delete({ id: link.id })
  }

  private async getEntity(id: string): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id },
      relations: { roles: true },
    })
    if (!user) throw new NotFoundException('用户不存在')
    return user
  }

  private async resolveRoles(roleIds?: string[]): Promise<Role[]> {
    if (!roleIds?.length) throw new BadRequestException('请至少选择一个角色')
    const roles = await this.roleRepo.find({ where: { id: In(roleIds) } })
    if (roles.length !== roleIds.length) {
      throw new BadRequestException('存在无效的角色')
    }
    return roles
  }

  private async assertNotDisableAdmin(user: User): Promise<void> {
    const isAdmin = (user.roles ?? []).some((r) => r.code === 'admin')
    if (isAdmin && user.username === 'admin') {
      throw new BadRequestException('不能禁用内置管理员账号')
    }
  }

  private async assertNotDeleteAdmin(user: User): Promise<void> {
    const isAdmin = (user.roles ?? []).some((r) => r.code === 'admin')
    if (isAdmin && user.username === 'admin') {
      throw new BadRequestException('不能删除内置管理员账号')
    }
  }

  /** 单个用户的公司访问（含公司名，供列表/表单展示） */
  private async companyAccessOf(
    userId: string,
  ): Promise<{ companyIds: string[]; companyNames: string[] }> {
    return (
      (await this.companyAccessMap([userId])).get(userId) ?? {
        companyIds: [],
        companyNames: [],
      }
    )
  }

  /** 批量查询用户-公司可见性，避免 N+1 */
  private async companyAccessMap(
    userIds: string[],
  ): Promise<Map<string, { companyIds: string[]; companyNames: string[] }>> {
    const result = new Map<string, { companyIds: string[]; companyNames: string[] }>()
    if (!userIds.length) return result
    const links = await this.linkRepo.find({ where: { userId: In(userIds), status: 1 } })
    const companyIds = [...new Set(links.map((l) => l.companyId))]
    const companies = companyIds.length
      ? await this.companyRepo.find({ where: { id: In(companyIds) } })
      : []
    const nameById = new Map(companies.map((c) => [c.id, c.name]))
    for (const link of links) {
      const entry = result.get(link.userId) ?? { companyIds: [], companyNames: [] }
      entry.companyIds.push(link.companyId)
      entry.companyNames.push(nameById.get(link.companyId) ?? '')
      result.set(link.userId, entry)
    }
    return result
  }

  private toVo(
    user: User,
    companyIds: string[] = [],
    companyNames: string[] = [],
  ): any {
    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      email: user.email,
      phone: user.phone,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      remark: user.remark,
      createdAt: user.createdAt,
      roleIds: (user.roles ?? []).map((r) => r.id),
      roles: (user.roles ?? []).map((r) => ({ id: r.id, code: r.code, name: r.name })),
      companyIds,
      companyNames,
    }
  }
}