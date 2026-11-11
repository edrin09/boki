import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectCompanyRepo } from '@core/common/company/company-repo.decorator'
import type { CompanyScopedRepository } from '@core/common/company/company.repository'
import { Employee, Payroll } from '@core/entities/hr.entity'
import { EmployeeStatus, PayrollStatus } from '@core/common/enums'
import { PayrollService } from '@plugin/hr/server/modules/payroll/payroll.service'
import { CatalogService } from '../bridge/catalog.service'
import type { ActionAdapter, ActionContext, ActionManifest, Preview } from '../bridge/protocol'
import { field, flag, money, normalizeDept, round2, text, todayString } from './action.util'

/**
 * 一句话发工资。
 *
 * 「发」在本系统分两步：先生成工资单草稿（计提），人工审核后才发放。
 * 这里只做第一步——按在职员工生成草稿，绝不直接发放或自动审核。
 */
@Injectable()
export class PayrollRunAction implements ActionAdapter {
  readonly manifest: ActionManifest = {
    id: 'payroll.run',
    title: '发工资',
    description: '按工资期间生成工资单草稿（含全部在职员工或指定部门），审核后才发放',
    params: {
      period: {
        type: 'number',
        label: '工资期间',
        required: true,
        editable: true,
        description: 'YYYYMM，如 202610 表示 2026 年 10 月',
      },
      payDate: { type: 'date', label: '发放日期', editable: true, default: 'today' },
      departmentName: { type: 'string', label: '部门', editable: true, resolve: 'department' },
    },
    examples: ['发一下 10 月工资，11 月 10 号发', '给销售部发上个月工资'],
    permission: 'hr:payroll:create',
    amountField: 'period',
  }

  constructor(
    private readonly payrolls: PayrollService,
    private readonly catalog: CatalogService,
    @InjectCompanyRepo(Employee)
    private readonly employeeRepo: CompanyScopedRepository<Employee>,
    @InjectCompanyRepo(Payroll)
    private readonly payrollRepo: CompanyScopedRepository<Payroll>,
  ) {}

  async preview(args: Record<string, unknown>, ctx: ActionContext): Promise<Preview> {
    const missing = []
    const warnings: string[] = []

    const period = Number(args.period)
    if (!Number.isFinite(period) || period < 190001 || period % 100 < 1 || period % 100 > 12) {
      flag(missing, 'period', '工资期间')
    }
    const payDate = text(args.payDate) || todayString()

    const deptName = text(args.departmentName)
    let deptId: string | undefined
    let deptLabel = ''
    // 「全部 / 不限 / 空」都当成「不按部门筛选」，不能拿去查档案
    const deptFilter = normalizeDept(deptName)
    if (deptFilter) {
      const dept = await this.catalog.matchDepartment(deptFilter)
      if (dept.hit) {
        deptId = dept.hit.id
        deptLabel = dept.hit.name
        if (dept.hit.name !== deptFilter) warnings.push(`部门按「${dept.hit.name}」处理`)
      } else {
        flag(missing, 'departmentName', '部门', 'department')
        warnings.push(`部门「${deptFilter}」不在档案里`)
      }
    }


    // 在职员工与应发合计：按基本工资估算，社保/个税等留到工资页核对
    const employees = (await this.employeeRepo.find({
      where: { status: EmployeeStatus.ON_JOB } as any,
      order: { code: 'ASC' } as any,
    })) as Employee[]
    const scoped = deptId ? employees.filter((e) => e.departmentId === deptId) : employees
    const gross = round2(scoped.reduce((sum, e) => sum + Number(e.baseSalary ?? 0), 0))

    if (!scoped.length) {
      warnings.push(deptId ? '该部门没有在职员工' : '还没有在职员工，请先添加人员')
    } else if (gross <= 0) {
      warnings.push(
        `${scoped.length} 位在职员工的「基本工资」都是 0，生成的工资单金额会是 0。请先到「人事 → 人员」补基本工资，或生成后逐行填`,
      )
    }

    if (period) {
      const existing = await this.payrollRepo.findOne({ where: { period } as any })
      if (existing) {
        warnings.push(
          `${period} 期间已有工资单（${existing.payrollNo}，状态：${this.statusLabel(existing.status)}），请勿重复生成`,
        )
      }
    }

    void ctx
    return {
      title: `工资单 · ${period ? `${Math.floor(period / 100)}年${period % 100}月` : '待补期间'}`,
      summary: `${scoped.length} 人 / 应发合计约 ${money(gross)} / ${payDate} 发放`,
      fields: [
        field('period', '工资期间', period ? `${period}` : '', true, { placeholder: '如 202610' }),
        field('payDate', '发放日期', payDate, true, { kind: 'date' }),
        field('departmentName', '部门', deptLabel, true, {
          kind: 'department',
          placeholder: '全部（不限部门）',
          emptyLabel: '全部（不限部门）',
        }),
        field('employeeCount', '在职人数', scoped.length, false),
        field('totalGross', '应发合计（按基本工资估算）', money(gross), false),
      ],
      lines: [],
      missing,
      warnings: [
        ...warnings,
        '生成后是草稿：社保、个税、借款扣回请在工资单里核对，审核后才计提并发放',
      ],
      items: scoped.slice(0, 30).map((employee) => ({
        id: employee.id,
        no: employee.code,
        summary: employee.name,
        amount: round2(employee.baseSalary ?? 0),
        status: '在职',
      })),
    }
  }

  async commit(args: Record<string, unknown>, ctx: ActionContext): Promise<Record<string, unknown>> {
    const period = Number(args.period)
    if (!Number.isFinite(period) || period < 190001) {
      throw new BadRequestException('还缺：工资期间（如 202610）')
    }
    const payDate = text(args.payDate) || todayString()

    let departmentId: string | undefined
    // 卡片上「部门」留空 = 全部部门；「全部」这类占位值同样按不筛选处理
    const deptName = normalizeDept(args.departmentName)
    if (deptName) {
      const dept = await this.catalog.matchDepartment(deptName)
      if (!dept.hit) throw new BadRequestException(`部门「${deptName}」不存在`)
      departmentId = dept.hit.id
    }

    const saved = await this.payrolls.generate({ period, payDate, departmentId }, ctx.operator)

    return {
      payrollId: saved.id,
      payrollNo: saved.payrollNo,
      employeeCount: saved.employeeCount,
      totalGross: round2(saved.totalGross),
      status: saved.status,
      route: '/hr/payrolls',
      routeText: '查看工资表',
      message: `已生成工资单草稿 ${saved.payrollNo}（${saved.employeeCount} 人），核对后请审核`,
    }
  }

  private statusLabel(status: string): string {
    if (status === PayrollStatus.APPROVED) return '已审核'
    if (status === PayrollStatus.PAID) return '已发放'
    return '草稿'
  }
}
