import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { Account } from '../entities/account.entity'
import { Permission } from '../entities/permission.entity'
import { Role } from '../entities/role.entity'
import { User } from '../entities/user.entity'
import { Company } from '../entities/company.entity'
import { UserCompany } from '../entities/user-company.entity'
import { hashPassword } from '../common/utils/crypto.util'
import { ACCOUNT_SEED, CATEGORY_LABELS, inferCategory } from './seeds/account.seed'
import {
  PERMISSION_SEED,
  ROLE_SEED,
  SeedPermissionNode,
  USER_SEED,
} from './seeds/permission.seed'

/** 首次启动时创建的默认公司编码 */
const DEFAULT_COMPANY_CODE = 'DEFAULT'

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name)

  constructor(
    @InjectRepository(Permission) private readonly permissionRepo: Repository<Permission>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Account) private readonly accountRepo: Repository<Account>,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    @InjectRepository(UserCompany) private readonly linkRepo: Repository<UserCompany>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedPermissions()
    await this.seedRoles()
    await this.syncPermissions()
    await this.syncRolePermissions()

    await this.seedUsers()

    // 多公司：全新库不预置「默认记账公司」，由用户在创建公司流程中自行建立；
    // 仅当存在 company_id 为空的历史数据（老库升级）时才补建默认公司承接
    const company = await this.ensureDefaultCompany()
    if (company) {
      await this.adoptOrphanData(company.id)
      await this.seedAccounts(company.id)
      await this.ensureUserCompanyAccess(company.id)
      await this.restoreCompanyBackup(company)
    }
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

  /**
   * 确保存在记账公司。
   *
   * 已有公司直接返回最早创建的一家；全新库不预置公司（返回 null），
   * 仅当存在未归属公司的历史数据（老库升级）时才补建默认公司承接。
   */
  private async ensureDefaultCompany(): Promise<Company | null> {
    const existing = await this.companyRepo.find({ order: { createdAt: 'ASC' } })
    if (existing.length) return existing[0]

    if (!(await this.hasOrphanData())) return null

    const company = await this.companyRepo.save(
      this.companyRepo.create({
        code: DEFAULT_COMPANY_CODE,
        name: '默认记账公司',
        taxNo: null,
        legalPerson: null,
        industry: null,
        address: null,
        bankName: null,
        bankAccount: null,
        fiscalStartMonth: 1,
        status: 1,
        remark: '系统升级自动创建（承接历史数据）',
      }),
    )
    this.logger.log(`检测到历史数据，已创建默认记账公司「${company.name}」承接`)
    return company
  }

  /** 是否存在 company_id 为空的历史数据行 */
  private async hasOrphanData(): Promise<boolean> {
    for (const repo of this.orphanRepos()) {
      try {
        const count = await repo.count({ where: { companyId: '' } } as any)
        if (count > 0) return true
      } catch {
        // 个别表可能尚未建表，跳过
      }
    }
    return false
  }

  /**
   * cleanup.bat 删库前会导出公司信息到 data/company-backup.json，
   * 重建后在此回填，避免公司配置（名称/税号等）随删库丢失。
   */
  private async restoreCompanyBackup(company: Company): Promise<void> {
    const backupPath = path.resolve(process.cwd(), 'data/company-backup.json')
    if (!fs.existsSync(backupPath)) return
    try {
      const saved = JSON.parse(fs.readFileSync(backupPath, 'utf8')) as Record<string, unknown>
      const patch: Record<string, unknown> = {}
      const pick = (col: string, field: string, allowNull = false) => {
        if (saved[col] !== undefined) {
          const v = saved[col]
          if (!(v === null && !allowNull)) patch[field] = v
        }
      }
      pick('name', 'name')
      pick('tax_no', 'taxNo', true)
      pick('taxpayer_type', 'taxpayerType', true)
      pick('vat_rate', 'vatRate', true)
      pick('tax_declare_cycle', 'taxDeclareCycle', true)
      pick('auto_post_threshold', 'autoPostThreshold', true)
      pick('auto_post_enabled', 'autoPostEnabled', true)
      pick('legal_person', 'legalPerson', true)
      pick('industry', 'industry', true)
      pick('address', 'address', true)
      pick('bank_name', 'bankName', true)
      pick('bank_account', 'bankAccount', true)
      pick('fiscal_start_month', 'fiscalStartMonth', true)
      if (Object.keys(patch).length === 0) {
        fs.rmSync(backupPath, { force: true })
        return
      }
      Object.assign(company, patch)
      await this.companyRepo.save(company)
      fs.rmSync(backupPath, { force: true })
      this.logger.log(`已从备份恢复公司信息「${company.name}」`)
    } catch (err) {
      this.logger.warn(`公司信息备份恢复失败: ${(err as Error).message}`)
    }
  }

  /**
   * 把 company_id 为空的历史数据归入默认公司。
   *
   * 多公司字段以 default '' 加入，老库行升级后为空串，必须回填，
   * 否则这些数据对任何公司都不可见。
   */
  private async adoptOrphanData(companyId: string): Promise<void> {
    let total = 0
    for (const repo of this.orphanRepos()) {
      try {
        const res = await repo.update({ companyId: '' }, { companyId } as any)
        total += res?.affected ?? 0
      } catch (err) {
        this.logger.warn(`历史数据归入默认公司时跳过一张表: ${(err as Error).message}`)
      }
    }

    if (total > 0) this.logger.log(`已将 ${total} 条历史数据归入默认记账公司`)
  }

  /** 涉及历史数据归属的表（容错访问，个别表缺失不影响其余表） */
  private orphanRepos(): Repository<any>[] {
    return [
      this.accountRepo as Repository<any>,
      this.partnerRepoSafe(),
      this.bankRepoSafe(),
      this.deptRepoSafe(),
      this.projectRepoSafe(),
      this.voucherRepoSafe(),
      this.entryRepoSafe(),
      this.receiptRepoSafe(),
      this.employeeRepoSafe(),
      this.claimRepoSafe(),
      this.claimItemRepoSafe(),
      this.payrollRepoSafe(),
      this.payrollItemRepoSafe(),
      this.initialBalanceRepoSafe(),
      this.cashFlowRepoSafe(),
      this.writeOffRepoSafe(),
      this.incomeExpenseRepoSafe(),
      this.classifyRuleRepoSafe(),
    ]
  }

  /** 初始化会计科目（默认公司） */
  private async seedAccounts(companyId: string): Promise<void> {
    const count = await this.accountRepo.count()
    if (count > 0) return

    let order = 0
    const saveRecursive = async (
      nodes: typeof ACCOUNT_SEED,
      parentId: string | null,
      parentPath: string[],
    ) => {
      for (const node of nodes) {
        order += 1
        const category = inferCategory(node.code)
        const path = [CATEGORY_LABELS[category] ?? category, ...parentPath, node.name]
        const level = path.length - 1
        const entity = this.accountRepo.create({
          companyId,
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
        const saved = await this.accountRepo.save(entity)
        if (node.children?.length) {
          await saveRecursive(node.children, saved.id, path)
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
   * 确保所有用户都至少能访问默认公司。
   *
   * 老用户没有 user_company 记录，若不补齐将无法登录。
   */
  private async ensureUserCompanyAccess(companyId: string): Promise<void> {
    const users = await this.userRepo.find()
    if (!users.length) return

    const links = await this.linkRepo.find({ where: { companyId } })
    const linked = new Set(links.map((l) => l.userId))
    const missing = users.filter((u) => !linked.has(u.id))
    if (!missing.length) return

    // 拥有 admin 角色或内置 admin 账号的用户标记为该公司所有者
    const isAdmin = (u: User) =>
      (u.roles ?? []).some((r) => r.code === 'admin') || u.username === 'admin'

    await this.linkRepo.save(
      missing.map((u) =>
        this.linkRepo.create({
          userId: u.id,
          companyId,
          isOwner: isAdmin(u),
          status: 1,
        }),
      ),
    )
    this.logger.log(`已为 ${missing.length} 个用户开通默认公司访问权`)
  }

  /**
   * 检查初始化状态（供系统信息接口使用）
   */
  async getInitStatus(): Promise<{
    permissions: number
    roles: number
    users: number
    accounts: number
    companies: number
    initialized: boolean
  }> {
    const [permissions, roles, users, accounts, companies] = await Promise.all([
      this.permissionRepo.count(),
      this.roleRepo.count(),
      this.userRepo.count(),
      this.accountRepo.count(),
      this.companyRepo.count(),
    ])
    return {
      permissions,
      roles,
      users,
      accounts,
      companies,
      initialized: users > 0 && accounts > 0,
    }
  }

  // ==================== 便捷访问器（延迟解析，避免构造顺序依赖） ====================

  private get dataSource() {
    return this.accountRepo.manager
  }

  private partnerRepoSafe(): Repository<any> {
    return this.repoOf('fin_partner')
  }
  private bankRepoSafe(): Repository<any> {
    return this.repoOf('fin_bank_account')
  }
  private deptRepoSafe(): Repository<any> {
    return this.repoOf('fin_department')
  }
  private projectRepoSafe(): Repository<any> {
    return this.repoOf('fin_project')
  }
  private voucherRepoSafe(): Repository<any> {
    return this.repoOf('fin_voucher')
  }
  private entryRepoSafe(): Repository<any> {
    return this.repoOf('fin_voucher_entry')
  }
  private receiptRepoSafe(): Repository<any> {
    return this.repoOf('fin_receipt')
  }
  private employeeRepoSafe(): Repository<any> {
    return this.repoOf('fin_employee')
  }
  private claimRepoSafe(): Repository<any> {
    return this.repoOf('fin_expense_claim')
  }
  private claimItemRepoSafe(): Repository<any> {
    return this.repoOf('fin_expense_claim_item')
  }
  private payrollRepoSafe(): Repository<any> {
    return this.repoOf('fin_payroll')
  }
  private payrollItemRepoSafe(): Repository<any> {
    return this.repoOf('fin_payroll_item')
  }
  private initialBalanceRepoSafe(): Repository<any> {
    return this.repoOf('fin_initial_balance')
  }
  private cashFlowRepoSafe(): Repository<any> {
    return this.repoOf('fin_cash_flow')
  }
  private writeOffRepoSafe(): Repository<any> {
    return this.repoOf('fin_write_off')
  }
  private incomeExpenseRepoSafe(): Repository<any> {
    return this.repoOf('fin_income_expense')
  }
  private classifyRuleRepoSafe(): Repository<any> {
    return this.repoOf('fin_classify_rule')
  }

  private repoOf(table: string): Repository<any> {
    return this.dataSource.getRepository(table)
  }
}