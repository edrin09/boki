import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { IsNull } from 'typeorm'
import { InitialBalance } from '../../entities/initial-balance.entity'
import { Account } from '../../entities/account.entity'
import { Partner } from '../../entities/partner.entity'
import { Department } from '../../entities/department.entity'
import { Project } from '../../entities/project.entity'
import { Employee } from '../../entities/hr.entity'
import { BalanceDirection } from '../../common/enums'
import { toCents, fromCents } from '../../common/utils/money.util'
import { CompanyScopedRepository } from '../../common/company/company.repository'
import { InjectCompanyRepo } from '../../common/company/company-repo.decorator'
import type {
  BatchSaveInitialBalanceDto,
  SaveInitialBalanceDto,
} from './dto/initial-balance.dto'

@Injectable()
export class InitialBalanceService {
  constructor(
    @InjectCompanyRepo(InitialBalance) private readonly repo: CompanyScopedRepository<InitialBalance>,
    @InjectCompanyRepo(Account) private readonly accountRepo: CompanyScopedRepository<Account>,
    @InjectCompanyRepo(Partner) private readonly partnerRepo: CompanyScopedRepository<Partner>,
    @InjectCompanyRepo(Department)
    private readonly departmentRepo: CompanyScopedRepository<Department>,
    @InjectCompanyRepo(Project) private readonly projectRepo: CompanyScopedRepository<Project>,
    @InjectCompanyRepo(Employee) private readonly employeeRepo: CompanyScopedRepository<Employee>,
  ) {}

  /** 按年度查询期初余额（可按科目过滤） */
  async findByYear(fiscalYear: number, accountId?: string): Promise<any[]> {
    // 注意：getRawMany 会对实体列自动加「别名_」前缀（如 ib_id），
    // 因此这里用显式别名把原始列统一映射为无前缀字段，保证 toVo 取值正确。
    const qb = this.repo
      .createQueryBuilder('ib')
      .leftJoin('Account', 'a', 'a.id = ib.accountId')
      .leftJoin('Partner', 'p', 'p.id = ib.partnerId')
      .leftJoin('Department', 'd', 'd.id = ib.departmentId')
      .leftJoin('Project', 'pr', 'pr.id = ib.projectId')
      .leftJoin('Employee', 'emp', 'emp.id = ib.employeeId')
      .select('ib.id', 'id')
      .addSelect('ib.fiscalYear', 'fiscalYear')
      .addSelect('ib.accountId', 'accountId')
      .addSelect('ib.accountCode', 'accountCode')
      .addSelect('ib.accountName', 'accountName')
      .addSelect('ib.partnerId', 'partnerId')
      .addSelect('ib.departmentId', 'departmentId')
      .addSelect('ib.projectId', 'projectId')
      .addSelect('ib.employeeId', 'employeeId')
      .addSelect('ib.direction', 'direction')
      .addSelect('ib.amount', 'amount')
      .addSelect('ib.remark', 'remark')
      .addSelect('ib.createdAt', 'createdAt')
      .addSelect('ib.updatedAt', 'updatedAt')
      .addSelect('a.code', 'a_code')
      .addSelect('a.name', 'a_name')
      .addSelect('a.fullName', 'a_fullName')
      .addSelect('a.category', 'a_category')
      .addSelect('a.direction', 'a_direction')
      .addSelect('a.level', 'a_level')
      .addSelect('p.name', 'p_name')
      .addSelect('d.name', 'd_name')
      .addSelect('pr.name', 'pr_name')
      .addSelect('emp.name', 'emp_name')
      .where('ib.fiscalYear = :fiscalYear', { fiscalYear })

    if (accountId) {
      qb.andWhere('ib.accountId = :accountId', { accountId })
    }

    const rows: any[] = await qb.orderBy('ib.accountCode', 'ASC').getRawMany()
    return rows.map((r) => this.toVo(r))
  }

  /** 保存（同一年度+科目+辅助核算组合唯一，存在则更新） */
  async save(dto: SaveInitialBalanceDto): Promise<any> {
    const account = await this.accountRepo.findOne({ where: { id: dto.accountId } })
    if (!account) throw new NotFoundException('会计科目不存在')
    if (toCents(dto.amount) === 0) {
      throw new BadRequestException('期初金额不能为 0，如需清空请删除该条记录')
    }

    await this.assertAuxiliaryValid(account, dto)

    const existing = await this.findExisting(dto)

    if (existing) {
      existing.direction = dto.direction as BalanceDirection
      existing.amount = dto.amount
      existing.remark = dto.remark ?? null
      const saved = await this.repo.save(existing)
      return this.toVo({ ...saved, a_code: account.code, a_name: account.name })
    }

    const entity = this.repo.create({
      fiscalYear: dto.fiscalYear,
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      partnerId: dto.partnerId || null,
      departmentId: dto.departmentId || null,
      projectId: dto.projectId || null,
      employeeId: dto.employeeId || null,
      direction: dto.direction as BalanceDirection,
      amount: dto.amount,
      remark: dto.remark ?? null,
    })
    const saved = await this.repo.save(entity)
    return this.toVo({ ...saved, a_code: account.code, a_name: account.name })
  }

  /** 批量保存 */
  async batchSave(dto: BatchSaveInitialBalanceDto): Promise<{ count: number; message: string }> {
    // 批量导入视为一套完整期初，先校验借贷平衡，避免把不平衡数据落库
    let debitCents = 0
    let creditCents = 0
    for (const item of dto.items) {
      const cents = toCents(item.amount)
      if (cents === 0) continue
      if (item.direction === BalanceDirection.DEBIT) debitCents += cents
      else creditCents += cents
    }
    if (debitCents !== creditCents) {
      throw new BadRequestException(
        `期初余额借贷不平衡：借方 ${fromCents(debitCents)}，贷方 ${fromCents(creditCents)}，` +
          `差额 ${fromCents(Math.abs(debitCents - creditCents))}`,
      )
    }

    let count = 0
    for (const item of dto.items) {
      if (toCents(item.amount) === 0) continue
      await this.save({ ...item, fiscalYear: dto.fiscalYear })
      count += 1
    }
    return { count, message: `已保存 ${count} 条期初余额` }
  }

  async remove(id: string): Promise<{ message: string }> {
    const entity = await this.repo.findOne({ where: { id } })
    if (!entity) throw new NotFoundException('期初余额不存在')
    await this.repo.delete({ id } as any)
    return { message: '删除成功' }
  }

  /** 按年度清空（谨慎使用） */
  async clearYear(fiscalYear: number): Promise<{ message: string }> {
    const result = await this.repo.delete({ fiscalYear })
    return { message: `已删除 ${fiscalYear} 年度的 ${result.affected ?? 0} 条期初余额` }
  }

  /** 试算平衡校验 */
  async checkBalance(fiscalYear: number): Promise<{
    debitTotal: number
    creditTotal: number
    balanced: boolean
    difference: number
    count: number
  }> {
    const rows = await this.repo.find({ where: { fiscalYear } })
    let debit = 0
    let credit = 0
    for (const row of rows) {
      if (row.direction === BalanceDirection.DEBIT) debit += toCents(row.amount)
      else credit += toCents(row.amount)
    }
    return {
      debitTotal: fromCents(debit),
      creditTotal: fromCents(credit),
      balanced: debit === credit,
      difference: fromCents(Math.abs(debit - credit)),
      count: rows.length,
    }
  }

  // ==================== 内部 ====================

  /**
   * 查找已存在的同组合记录。
   * 注意：辅助核算列存为 NULL，而 SQLite 唯一索引不把 NULL 视为相等，
   * 因此这里必须用 IsNull() 显式匹配空值。
   */
  private async findExisting(dto: SaveInitialBalanceDto): Promise<InitialBalance | null> {
    const norm = (v?: string) => (v ? v : IsNull())
    return this.repo.findOne({
      where: {
        fiscalYear: dto.fiscalYear,
        accountId: dto.accountId,
        partnerId: norm(dto.partnerId) as any,
        departmentId: norm(dto.departmentId) as any,
        projectId: norm(dto.projectId) as any,
        employeeId: norm(dto.employeeId) as any,
      },
    })
  }

  /**
   * 辅助核算校验：科目声明了该维度则必填
   */
  private async assertAuxiliaryValid(
    account: Account,
    dto: SaveInitialBalanceDto,
  ): Promise<void> {
    const types: string[] = (account.auxiliaryTypes ?? []) as unknown as string[]

    if (types.includes('partner')) {
      if (!dto.partnerId) throw new BadRequestException(`科目「${account.fullName}」必须指定往来单位`)
      const exists = await this.partnerRepo.findOne({ where: { id: dto.partnerId } })
      if (!exists) throw new NotFoundException('往来单位不存在')
    }
    if (types.includes('department')) {
      if (!dto.departmentId) throw new BadRequestException(`科目「${account.fullName}」必须指定部门`)
      const exists = await this.departmentRepo.findOne({ where: { id: dto.departmentId } })
      if (!exists) throw new NotFoundException('部门不存在')
    }
    if (types.includes('project')) {
      if (!dto.projectId) throw new BadRequestException(`科目「${account.fullName}」必须指定项目`)
      const exists = await this.projectRepo.findOne({ where: { id: dto.projectId } })
      if (!exists) throw new NotFoundException('项目不存在')
    }
    if (types.includes('employee')) {
      if (!dto.employeeId) throw new BadRequestException(`科目「${account.fullName}」必须指定员工`)
      const exists = await this.employeeRepo.findOne({ where: { id: dto.employeeId } })
      if (!exists) throw new NotFoundException('员工不存在')
    }
  }

  private toVo(row: any): any {
    return {
      id: row.id,
      fiscalYear: row.fiscalYear,
      accountId: row.accountId,
      accountCode: row.accountCode,
      accountName: row.accountName,
      accountFullName: row.a_fullName ?? row.accountName,
      category: row.a_category ?? null,
      accountDirection: row.a_direction ?? null,
      level: row.a_level ?? null,
      partnerId: row.partnerId,
      partnerName: row.p_name ?? null,
      departmentId: row.departmentId,
      departmentName: row.d_name ?? null,
      projectId: row.projectId,
      projectName: row.pr_name ?? null,
      employeeId: row.employeeId,
      employeeName: row.emp_name ?? null,
      direction: row.direction,
      amount: row.amount,
      remark: row.remark,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
}