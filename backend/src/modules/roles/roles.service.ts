import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { Role } from '../../entities/role.entity'
import { Permission } from '../../entities/permission.entity'
import type { CreateRoleDto, UpdateRoleDto } from './dto/role.dto'

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(Permission) private readonly permissionRepo: Repository<Permission>,
  ) {}

  /** 角色列表（含权限） */
  async findAll(): Promise<any[]> {
    const roles = await this.roleRepo.find({
      relations: { permissions: true },
      order: { sort: 'ASC', createdAt: 'ASC' },
    })
    return roles.map((r) => this.toVo(r))
  }

  /** 角色下拉选项 */
  async findOptions(): Promise<any[]> {
    const roles = await this.roleRepo.find({ order: { sort: 'ASC' } })
    return roles.map((r) => ({ id: r.id, code: r.code, name: r.name }))
  }

  async findOne(id: string): Promise<any> {
    const role = await this.getEntity(id)
    return this.toVo(role)
  }

  async create(dto: CreateRoleDto): Promise<any> {
    const exists = await this.roleRepo.findOne({ where: { code: dto.code } })
    if (exists) throw new ConflictException(`角色标识「${dto.code}」已存在`)

    const role = this.roleRepo.create({
      code: dto.code,
      name: dto.name,
      description: dto.description ?? null,
      isSystem: false,
      sort: dto.sort ?? 0,
    })

    if (dto.permissionIds) {
      role.permissions = await this.resolvePermissions(dto.permissionIds)
    }

    const saved = await this.roleRepo.save(role)
    return this.toVo(saved)
  }

  async update(id: string, dto: UpdateRoleDto): Promise<any> {
    const role = await this.getEntity(id)
    if (dto.name !== undefined) role.name = dto.name
    if (dto.description !== undefined) role.description = dto.description || null
    if (dto.sort !== undefined) role.sort = dto.sort
    const saved = await this.roleRepo.save(role)
    return this.toVo(saved)
  }

  async remove(id: string): Promise<{ message: string }> {
    const role = await this.getEntity(id)
    if (role.isSystem) throw new BadRequestException('系统内置角色不可删除')
    await this.roleRepo.delete(id)
    return { message: '删除成功' }
  }

  /** 分配权限 */
  async assignPermissions(id: string, permissionIds: string[]): Promise<any> {
    const role = await this.getEntity(id)
    if (role.isSystem && role.code === 'admin') {
      throw new BadRequestException('超级管理员固定拥有全部权限，无需分配')
    }
    role.permissions = await this.resolvePermissions(permissionIds)
    const saved = await this.roleRepo.save(role)
    return this.toVo(saved)
  }

  private async getEntity(id: string): Promise<Role> {
    const role = await this.roleRepo.findOne({ where: { id }, relations: { permissions: true } })
    if (!role) throw new NotFoundException('角色不存在')
    return role
  }

  private async resolvePermissions(permissionIds: string[]): Promise<Permission[]> {
    if (!permissionIds.length) return []
    const permissions = await this.permissionRepo.find({ where: { id: In(permissionIds) } })
    if (permissions.length !== permissionIds.length) {
      throw new BadRequestException('存在无效的权限')
    }
    return permissions
  }

  private toVo(role: Role): any {
    return {
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      sort: role.sort,
      permissionIds: (role.permissions ?? []).map((p) => p.id),
      permissionCodes: (role.permissions ?? []).map((p) => p.code),
      permissionCount: (role.permissions ?? []).length,
      createdAt: role.createdAt,
    }
  }
}