import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectCompanyRepo } from '@core/common/company/company-repo.decorator'
import type { CompanyScopedRepository } from '@core/common/company/company.repository'
import { Employee } from '@core/entities/hr.entity'
import { EmployeeStatus } from '@core/common/enums'
import { EmployeesService } from '@plugin/hr/server/modules/employees/employees.service'
import { CatalogService } from '../bridge/catalog.service'
import type { ActionAdapter, ActionContext, ActionManifest, Preview } from '../bridge/protocol'
import { field, flag, money, normalizeDept, round2, text, todayString } from './action.util'

/**
 * 一句话添加人员。
 *
 * 工号由服务端生成（员工服务负责），部门按名称解析；
 * 确认即建档——档案类数据没有「草稿」状态，用户的确认就是人工审核。
 */
@Injectable()
export class EmployeeCreateAction implements ActionAdapter {
  readonly manifest: ActionManifest = {
    id: 'employee.create',
    title: '添加人员',
    description: '新增一名员工档案，需要姓名；部门、岗位、月薪可选',
    params: {
      name: { type: 'string', label: '姓名', required: true, editable: true },
      departmentName: { type: 'string', label: '部门', editable: true, resolve: 'department' },
      position: { type: 'string', label: '岗位', editable: true },
      baseSalary: { type: 'number', label: '月薪', editable: true, min: 0 },
      phone: { type: 'string', label: '手机', editable: true },
      idCard: { type: 'string', label: '身份证号', editable: true },
      hireDate: { type: 'date', label: '入职日期', editable: true },
      employmentType: {
        type: 'enum',
        label: '用工性质',
        editable: true,
        enum: ['full_time', 'part_time'],
        description: 'full_time 全职 / part_time 兼职',
      },
    },
    examples: ['新增员工张三，销售部，月薪 8000', '加个人，李四，会计'],
    permission: 'hr:employee:create',
    amountField: 'baseSalary',
  }

  constructor(
    private readonly employees: EmployeesService,
    private readonly catalog: CatalogService,
    @InjectCompanyRepo(Employee)
    private readonly employeeRepo: CompanyScopedRepository<Employee>,
  ) {}

  async preview(args: Record<string, unknown>): Promise<Preview> {
    const missing = []
    const warnings: string[] = []

    const name = text(args.name)
    if (!name) flag(missing, 'name', '姓名')

    const deptName = normalizeDept(args.departmentName)
    let deptLabel = ''
    let deptId: string | undefined
    if (deptName) {
      const dept = await this.catalog.matchDepartment(deptName)
      if (dept.hit) {
        deptLabel = dept.hit.name
        deptId = dept.hit.id
        if (dept.hit.name !== deptName) warnings.push(`部门按「${dept.hit.name}」处理`)
      } else {
        flag(missing, 'departmentName', '部门', 'department')
        warnings.push(`部门「${deptName}」不在档案里，请先在「基础资料 → 部门」新增`)
      }
    }

    const nextCode = await this.employees.getNextCode()

    if (name) {
      const sameName = await this.employeeRepo.find({ where: { name } as any })
      if (sameName.length) {
        warnings.push(`已存在同名员工「${name}」（工号 ${sameName[0].code}），请确认不是重复建档`)
      }
    }

    const salary = args.baseSalary !== undefined ? round2(args.baseSalary) : 0
    if (!salary) warnings.push('没提月薪，将按 0 建档，之后可在员工档案里补')
    if (text(args.phone) && !/^1\d{10}$/.test(text(args.phone))) {
      warnings.push('手机号格式看起来不对，请核对')
    }

    void deptId
    return {
      title: `新增员工 · ${name || '待补姓名'}`,
      summary: `${name || '（待补）'}${deptLabel ? ` / ${deptLabel}` : ''}${salary ? ` / 月薪 ${money(salary)}` : ''}`,
      fields: [
        field('name', '姓名', name),
        field('code', '工号（自动）', nextCode, false),
        field('departmentName', '部门', deptLabel, true, {
          kind: 'department',
          placeholder: '不选则暂不归属部门',
        }),
        field('position', '岗位', text(args.position)),
        field('baseSalary', '月薪', salary ? money(salary) : '', true, { kind: 'amount' }),
        field('phone', '手机', text(args.phone)),
        field('idCard', '身份证号', text(args.idCard)),
        field('hireDate', '入职日期', text(args.hireDate) || todayString(), true, { kind: 'date' }),
      ],
      lines: [],
      missing,
      warnings,
      items: [],
    }
  }

  async commit(args: Record<string, unknown>, ctx: ActionContext): Promise<Record<string, unknown>> {
    const name = text(args.name)
    if (!name) throw new BadRequestException('还缺：姓名')

    let departmentId: string | undefined
    const deptName = normalizeDept(args.departmentName)
    if (deptName) {
      const dept = await this.catalog.matchDepartment(deptName)
      if (!dept.hit) {
        throw new BadRequestException(`部门「${deptName}」不存在，请先新增部门`)
      }
      departmentId = dept.hit.id
    }

    const saved = await this.employees.create({
      name,
      departmentId,
      position: text(args.position) || undefined,
      baseSalary: args.baseSalary !== undefined ? round2(args.baseSalary) : 0,
      phone: text(args.phone) || undefined,
      idCard: text(args.idCard) || undefined,
      hireDate: text(args.hireDate) || todayString(),
      employmentType: text(args.employmentType) || 'full_time',
      status: EmployeeStatus.ON_JOB,
    })

    void ctx
    return {
      employeeId: saved.id,
      code: saved.code,
      name: saved.name,
      route: '/hr/employees',
      routeText: '查看员工档案',
      message: `已建档：${saved.name}（工号 ${saved.code}）`,
    }
  }
}
