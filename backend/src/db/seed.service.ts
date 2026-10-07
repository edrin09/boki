import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Account } from '../entities/account.entity'
import { Permission } from '../entities/permission.entity'
import { Role } from '../entities/role.entity'
import { User } from '../entities/user.entity'
import { hashPassword } from '../common/utils/crypto.util'
import { ACCOUNT_SEED, CATEGORY_LABELS, inferCategory } from './seeds/account.seed'
import {
  PERMISSION_SEED,
  ROLE_SEED,
  SeedPermissionNode,
  USER_SEED,
} from './seeds/permission.seed'

/**
 * 初始化种子数据（幂等：已存在则跳过）
 */
@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name)

  constructor(
    @InjectRepository(Permission) private readonly permissionRepo: Repository<Permission>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Account) private readonly accountRepo: Repository<Account>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedPermissions()
    await this.seedRoles()
    await this.syncPermissions()
    await this.syncRolePermissions()
    await this.seedAccounts()
    await this.seedUsers()
  }

  /** 初始化权限树 */
  private async seedPermissions(): Promise<void> {
    const count = await this.permissionRepo.count()
    if (count > 0) return

    let sort = 0
    const saveRecursive = async (nodes: SeedPermissionNode[], parentId: string | null) => {
      for (const node of nodes) {
        sort += 1
        const entity = this.permissionRepo.create({
          code: node.code,
          name: node.name,
          module: node.module,
          type: node.type ?? 'action',
          parentId,
          path: node.path ?? null,
          icon: node.icon ?? null,
          sort: node.sort ?? sort,
          remark: null,
        })
        const saved = await this.permissionRepo.save(entity)
        if (node.children?.length) {
          await saveRecursive(node.children, saved.id)
        }
      }
    }

    await saveRecursive(PERMISSION_SEED, null)
    this.logger.log(`已初始化权限 ${await this.permissionRepo.count()} 条`)
  }

  /** 初始化角色并分配权限 */
  private async seedRoles(): Promise<void> {
    const count = await this.roleRepo.count()
    if (count > 0) return

    const allPermissions = await this.permissionRepo.find()
    const byCode = new Map(allPermissions.map((p) => [p.code, p]))

    for (const def of ROLE_SEED) {
      const role = this.roleRepo.create({
        code: def.code,
        name: def.name,
        description: def.description,
        isSystem: true,
        sort: def.sort,
      })
      const permissions = def.allPermissions
        ? allPermissions
        : def.permissions.map((code) => byCode.get(code)).filter(Boolean)
      role.permissions = permissions as Permission[]
      await this.roleRepo.save(role)
    }
    this.logger.log(`已初始化角色 ${await this.roleRepo.count()} 个`)
  }

  /**
   * 增量补齐权限：把种子里新增的权限点写入已存在的库。
   *
   * seedPermissions 仅在权限表为空时执行，老库不会自动获得新权限点，
   * 因此按 code 做增量插入（不删除、不改动已有节点）。
   */
  private async syncPermissions(): Promise<void> {
    const existing = await this.permissionRepo.find()
    const byCode = new Map(existing.map((p) => [p.code, p]))
    let added = 0

    const walk = async (nodes: SeedPermissionNode[], parentId: string | null): Promise<void> => {
      for (const node of nodes) {
        let entity = byCode.get(node.code)
        if (!entity) {
          entity = await this.permissionRepo.save(
            this.permissionRepo.create({
              code: node.code,
              name: node.name,
              module: node.module,
              type: node.type ?? 'action',
              parentId,
              path: node.path ?? null,
              icon: node.icon ?? null,
              sort: node.sort ?? 0,
              remark: null,
            }),
          )
          byCode.set(node.code, entity)
          added += 1
        }
        if (node.children?.length) await walk(node.children, entity.id)
      }
    }

    await walk(PERMISSION_SEED, null)
    if (added > 0) this.logger.log(`增量补齐权限 ${added} 条`)
  }

  /** 增量补齐角色权限：把种子中新增的权限补发给系统角色（只增不减） */
  private async syncRolePermissions(): Promise<void> {
    const all = await this.permissionRepo.find()
    const byCode = new Map(all.map((p) => [p.code, p]))
    let changed = 0

    for (const def of ROLE_SEED) {
      const role = await this.roleRepo.findOne({
        where: { code: def.code },
        relations: { permissions: true },
      })
      if (!role) continue

      const owned = new Set((role.permissions ?? []).map((p) => p.id))
      const wanted = def.allPermissions
        ? all
        : (def.permissions.map((code) => byCode.get(code)).filter(Boolean) as Permission[])
      const missing = wanted.filter((p) => !owned.has(p.id))
      if (missing.length === 0) continue

      role.permissions = [...(role.permissions ?? []), ...missing]
      await this.roleRepo.save(role)
      changed += missing.length
    }

    if (changed > 0) this.logger.log(`增量补齐角色权限 ${changed} 条`)
  }

  /** 初始化会计科目 */
  private async seedAccounts(): Promise<void> {
    const count = await this.accountRepo.count()
    if (count > 0) return

    let order = 0
    const saveRecursive = async (nodes: typeof ACCOUNT_SEED, parentId: string | null, parentPath: string[]) => {
      for (const node of nodes) {
        order += 1
        const category = inferCategory(node.code)
        const path = [CATEGORY_LABELS[category] ?? category, ...parentPath, node.name]
        const level = path.length - 1
        const entity = this.accountRepo.create({
          code: node.code,
          name: node.name,
          fullName: path.join('.'),
          category,
          level,
          direction: node.direction,
          parentId,
          isLeaf: !node.children?.length,
          auxiliaryTypes: node.auxiliaryTypes ?? null,
          isCash: node.isCash ?? false,
          isBank: node.isBank ?? false,
          status: 1,
          sort: node.sort ?? order,
          remark: null,
        })
        await this.accountRepo.save(entity)
        if (node.children?.length) {
          await saveRecursive(node.children, entity.id, path)
        }
      }
    }

    await saveRecursive(ACCOUNT_SEED, null, [])
    this.logger.log(`已初始化会计科目 ${await this.accountRepo.count()} 个`)
  }

  /** 初始化默认用户 */
  private async seedUsers(): Promise<void> {
    const count = await this.userRepo.count()
    if (count > 0) return

    const roles = await this.roleRepo.find()
    const roleMap = new Map(roles.map((r) => [r.code, r]))

    const adminUsername = process.env.INIT_ADMIN_USERNAME || 'admin'
    const adminPassword = process.env.INIT_ADMIN_PASSWORD || '123456'
    const adminNickname = process.env.INIT_ADMIN_NICKNAME || '系统管理员'

    for (const def of USER_SEED) {
      const userRoles = def.roles.map((code) => roleMap.get(code)).filter(Boolean) as Role[]
      const user = this.userRepo.create({
        username: def.username === 'admin' ? adminUsername : def.username,
        password: await hashPassword(def.username === 'admin' ? adminPassword : def.password),
        nickname: def.username === 'admin' ? adminNickname : def.nickname,
        email: null,
        phone: null,
        status: 1,
        remark: '系统初始化账号',
        roles: userRoles,
      })
      await this.userRepo.save(user)
    }
    this.logger.log(`已初始化用户 ${await this.userRepo.count()} 个`)
  }

  /**
   * 检查初始化状态（供系统信息接口使用）
   */
  async getInitStatus(): Promise<{
    permissions: number
    roles: number
    users: number
    accounts: number
    initialized: boolean
  }> {
    const [permissions, roles, users, accounts] = await Promise.all([
      this.permissionRepo.count(),
      this.roleRepo.count(),
      this.userRepo.count(),
      this.accountRepo.count(),
    ])
    return {
      permissions,
      roles,
      users,
      accounts,
      initialized: users > 0 && accounts > 0,
    }
  }
}