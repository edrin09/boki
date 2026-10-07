import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, In, Repository } from 'typeorm'
import { User } from '../../entities/user.entity'
import { Role } from '../../entities/role.entity'
import { hashPassword } from '../../common/utils/crypto.util'
import type { PageResult, PaginationQueryDto } from '../../common/dto/pagination.dto'
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
    return { list: list.map((u) => this.toVo(u)), total, page, pageSize }
  }

  /** 查询全部用户（下拉选项） */
  async findAllOptions(): Promise<any[]> {
    const users = await this.userRepo.find({ order: { nickname: 'ASC' } })
    return users.map((u) => ({ id: u.id, username: u.username, nickname: u.nickname }))
  }

  /** 详情 */
  async findOne(id: string): Promise<any> {
    const user = await this.getEntity(id)
    return this.toVo(user)
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
    return this.toVo(saved)
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

    const saved = await this.userRepo.save(user)
    return this.toVo(saved)
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

  private toVo(user: User): any {
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
    }
  }
}