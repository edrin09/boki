import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Permission } from '@core/entities/permission.entity'
import { buildTree, sortTree } from '@core/common/utils/tree.util'
import { collectDescendantIds } from '@core/common/utils/tree.util'
import { Role } from '@core/entities/role.entity'

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission) private readonly permissionRepo: Repository<Permission>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
  ) {}

  /** 扁平列表 */
  async findAll(): Promise<Permission[]> {
    return this.permissionRepo.find({ order: { sort: 'ASC', code: 'ASC' } })
  }

  /** 权限树 */
  async findTree(): Promise<any[]> {
    const list = await this.findAll()
    const tree = buildTree(list)
    sortTree(tree)
    return tree
  }

  /** 菜单树（仅 type=menu，供前端动态路由） */
  async findMenuTree(): Promise<any[]> {
    const list = (await this.findAll()).filter((p) => p.type === 'menu')
    const tree = buildTree(list)
    sortTree(tree)
    return tree
  }

  async findOne(id: string): Promise<Permission> {
    const perm = await this.permissionRepo.findOne({ where: { id } })
    if (!perm) throw new NotFoundException('权限不存在')
    return perm
  }

  async create(dto: Partial<Permission>): Promise<Permission> {
    const entity = this.permissionRepo.create({
      code: dto.code,
      name: dto.name,
      module: dto.module ?? (dto.code?.split(':')[0] ?? 'system'),
      type: dto.type ?? 'action',
      parentId: dto.parentId ?? null,
      path: dto.path ?? null,
      icon: dto.icon ?? null,
      sort: dto.sort ?? 0,
      remark: dto.remark ?? null,
    })
    return this.permissionRepo.save(entity)
  }

  async update(id: string, dto: Partial<Permission>): Promise<Permission> {
    const perm = await this.findOne(id)
    Object.assign(perm, {
      name: dto.name ?? perm.name,
      module: dto.module ?? perm.module,
      type: dto.type ?? perm.type,
      path: dto.path ?? perm.path,
      icon: dto.icon ?? perm.icon,
      sort: dto.sort ?? perm.sort,
      remark: dto.remark ?? perm.remark,
    })
    return this.permissionRepo.save(perm)
  }

  async remove(id: string): Promise<{ message: string }> {
    const perm = await this.findOne(id)
    const all = await this.findAll()
    const descendants = collectDescendantIds(all, id)
    if (descendants.size > 0) {
      throw new NotFoundException('请先删除子权限后再删除当前权限')
    }
    // 被角色引用时禁止删除
    const roles = await this.roleRepo.find({ relations: { permissions: true } })
    const used = roles.find((r) => (r.permissions ?? []).some((p) => p.id === perm.id))
    if (used) {
      throw new NotFoundException(`权限已被角色「${used.name}」引用，无法删除`)
    }
    await this.permissionRepo.delete(id)
    return { message: '删除成功' }
  }
}