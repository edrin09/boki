import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, Repository } from 'typeorm'
import { Employee, ExpenseClaim, PayrollItem } from '../../entities/hr.entity'
import { Department } from '../../entities/department.entity'
import { EmployeeStatus } from '../../common/enums'
import { CODE_PREFIX, nextCode } from '../../common/utils/code.util'
import type { PageResult, PaginationQueryDto } from '../../common/dto/pagination.dto'
import type { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto'

export interface BatchCreateItemResult {
  index: number
  success: boolean
  id?: string
  code?: string
  name?: string
  message?: string
}

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee) private readonly repo: Repository<Employee>,
    @InjectRepository(Department) private readonly deptRepo: Repository<Department>,
    @InjectRepository(ExpenseClaim) private readonly claimRepo: Repository<ExpenseClaim>,
    @InjectRepository(PayrollItem) private readonly payrollItemRepo: Repository<PayrollItem>,
  ) {}

  async findAll(
    query: PaginationQueryDto & { status?: number; departmentId?: string },
  ): Promise<PageResult<any>> {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const qb = this.repo
      .createQueryBuilder('e')
      .leftJoin('Department', 'd', 'd.id = e.departmentId')
      .addSelect('d.name', 'dept_name')

    if (query.keyword) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('e.code LIKE :kw', { kw: `%${query.keyword}%` })
            .orWhere('e.name LIKE :kw', { kw: `%${query.keyword}%` })
            .orWhere('e.phone LIKE :kw', { kw: `%${query.keyword}%` })
            .orWhere('e.position LIKE :kw', { kw: `%${query.keyword}%` })
        }),
      )
    }
    if (query.status !== undefined && query.status !== null && query.status !== ('' as any)) {
      qb.andWhere('e.status = :status', { status: query.status })
    }
    if (query.departmentId) {
      qb.andWhere('e.departmentId = :departmentId', { departmentId: query.departmentId })
    }

    const [list, total] = await qb
      .orderBy('e.code', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount()

    const deptNames = await this.loadDeptNames()
    return {
      list: list.map((e) => this.toVo(e, deptNames)),
      total,
      page,
      pageSize,
    }
  }

  /** 在职员工下拉选项 */
  async findOptions(onlyOnJob = true): Promise<any[]> {
    const list = await this.repo.find({ order: { code: 'ASC' } })
    return list
      .filter((e) => (onlyOnJob ? e.status === EmployeeStatus.ON_JOB : true))
      .map((e) => ({ id: e.id, code: e.code, name: e.name, departmentId: e.departmentId }))
  }

  async findOne(id: string): Promise<any> {
    const employee = await this.repo.findOne({ where: { id } })
    if (!employee) throw new NotFoundException('员工不存在')
    const deptNames = await this.loadDeptNames()
    return this.toVo(employee, deptNames)
  }

  /** 预览下一个可用工号 */
  async getNextCode(): Promise<string> {
    return nextCode(this.repo, CODE_PREFIX.employee)
  }

  async create(dto: CreateEmployeeDto): Promise<any> {
    const code = (dto.code ?? '').trim() || (await this.getNextCode())
    const exists = await this.repo.findOne({ where: { code } })
    if (exists) throw new ConflictException(`工号「${code}」已存在`)

    if (dto.departmentId) await this.assertDeptExists(dto.departmentId)

    const entity = this.repo.create({
      code,
      name: dto.name,
      gender: dto.gender ?? 'unknown',
      departmentId: dto.departmentId || null,
      position: dto.position ?? null,
      idCard: dto.idCard ?? null,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      hireDate: dto.hireDate ?? null,
      leaveDate: null,
      baseSalary: dto.baseSalary ?? 0,
      bankName: dto.bankName ?? null,
      bankAccount: dto.bankAccount ?? null,
      status: dto.status ?? EmployeeStatus.ON_JOB,
      remark: dto.remark ?? null,
    })
    const saved = await this.repo.save(entity)
    const deptNames = await this.loadDeptNames()
    return this.toVo(saved, deptNames)
  }

  /** 批量新增：逐条独立入库，返回每条结果（部分失败不影响其他行） */
  async createBatch(items: CreateEmployeeDto[]): Promise<{
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

  async update(id: string, dto: UpdateEmployeeDto): Promise<any> {
    const employee = await this.findEntity(id)
    if (dto.departmentId) await this.assertDeptExists(dto.departmentId)

    if (dto.name !== undefined) employee.name = dto.name
    if (dto.gender !== undefined) employee.gender = dto.gender
    if (dto.departmentId !== undefined) employee.departmentId = dto.departmentId || null
    if (dto.position !== undefined) employee.position = dto.position || null
    if (dto.idCard !== undefined) employee.idCard = dto.idCard || null
    if (dto.phone !== undefined) employee.phone = dto.phone || null
    if (dto.email !== undefined) employee.email = dto.email || null
    if (dto.hireDate !== undefined) employee.hireDate = dto.hireDate || null
    if (dto.leaveDate !== undefined) employee.leaveDate = dto.leaveDate || null
    if (dto.baseSalary !== undefined) employee.baseSalary = dto.baseSalary
    if (dto.bankName !== undefined) employee.bankName = dto.bankName || null
    if (dto.bankAccount !== undefined) employee.bankAccount = dto.bankAccount || null
    if (dto.status !== undefined) employee.status = dto.status
    if (dto.remark !== undefined) employee.remark = dto.remark || null

    const saved = await this.repo.save(employee)
    const deptNames = await this.loadDeptNames()
    return this.toVo(saved, deptNames)
  }

  async remove(id: string): Promise<{ message: string }> {
    const employee = await this.findEntity(id)
    void employee

    const usedClaim = await this.claimRepo.count({ where: { employeeId: id } })
    if (usedClaim > 0) {
      throw new ConflictException(`该员工存在 ${usedClaim} 张报销单，无法删除。可改为「离职」`)
    }
    const usedPayroll = await this.payrollItemRepo.count({ where: { employeeId: id } })
    if (usedPayroll > 0) {
      throw new ConflictException(`该员工存在 ${usedPayroll} 条工资记录，无法删除。可改为「离职」`)
    }

    await this.repo.delete(id)
    return { message: '删除成功' }
  }

  // ==================== 内部 ====================

  private async findEntity(id: string): Promise<Employee> {
    const employee = await this.repo.findOne({ where: { id } })
    if (!employee) throw new NotFoundException('员工不存在')
    return employee
  }

  private async assertDeptExists(departmentId: string): Promise<void> {
    const exists = await this.deptRepo.findOne({ where: { id: departmentId } })
    if (!exists) throw new NotFoundException('部门不存在')
  }

  private async loadDeptNames(): Promise<Map<string, string>> {
    const depts = await this.deptRepo.find()
    return new Map(depts.map((d) => [d.id, d.name]))
  }

  private toVo(employee: Employee, deptNames: Map<string, string>): any {
    return {
      id: employee.id,
      code: employee.code,
      name: employee.name,
      gender: employee.gender,
      departmentId: employee.departmentId,
      departmentName: employee.departmentId ? (deptNames.get(employee.departmentId) ?? null) : null,
      position: employee.position,
      idCard: employee.idCard,
      phone: employee.phone,
      email: employee.email,
      hireDate: employee.hireDate,
      leaveDate: employee.leaveDate,
      baseSalary: employee.baseSalary,
      bankName: employee.bankName,
      bankAccount: employee.bankAccount,
      status: employee.status,
      remark: employee.remark,
      createdAt: employee.createdAt,
    }
  }
}