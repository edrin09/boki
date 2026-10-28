import { BadRequestException, Injectable } from '@nestjs/common'
import { Employee } from '@core/entities/hr.entity'
import { Department } from '@core/entities/department.entity'
import { CODE_PREFIX, nextCode } from '@core/common/utils/code.util'
import { CompanyScopedRepository } from '@core/common/company/company.repository'
import { InjectCompanyRepo } from '@core/common/company/company-repo.decorator'
import { EmployeesService } from './employees.service'
import {
  cellText,
  excelDateToStr,
  findHeaderRow,
  isSummaryRow,
  mapColumns,
  readSheetGrid,
  round2,
  toNum,
} from '@core/common/utils/sheet-import.util'
import type { CommitEmployeesImportDto, ImportEmployeeRowDto } from './dto/employee-import.dto'

/** 花名册列规则（关键词按优先级排列） */
const COLUMN_RULES = [
  { key: 'name', keywords: ['姓名', '员工姓名', '员工', '名字'] },
  { key: 'gender', keywords: ['性别'] },
  { key: 'idCard', keywords: ['身份证号', '身份证', '证件号码', '证件号'] },
  { key: 'phone', keywords: ['手机号', '手机', '电话', '联系方式'] },
  { key: 'department', keywords: ['部门', '所属部门'] },
  { key: 'position', keywords: ['岗位', '职位'] },
  { key: 'employmentType', keywords: ['用工性质', '用工类型', '全职兼职', '雇佣类型', '员工类型'] },
  { key: 'bankName', keywords: ['开户银行', '开户行', '银行名称'] },
  { key: 'bankAccount', keywords: ['工资卡号', '银行卡号', '卡号', '账号'] },
  { key: 'hireDate', keywords: ['入职日期', '入职时间', '入职'] },
  { key: 'baseSalary', keywords: ['基本工资', '底薪', '月薪'] },
]

export interface EmployeeImportRow {
  rowIndex: number
  name: string
  gender: string
  genderLabel: string
  idCard: string
  phone: string
  departmentName: string
  position: string
  /** 用工性质：full_time 全职 / part_time 兼职（无法识别时为空串，按全职处理） */
  employmentType: string
  employmentTypeLabel: string
  bankName: string
  bankAccount: string
  hireDate: string
  baseSalary: number
  /** true = 档案已存在（导入时跳过） */
  exists: boolean
  existingId: string | null
  /** 部门档案不存在，确认导入时将自动创建 */
  departmentWillCreate: boolean
  message?: string
}

/**
 * 员工花名册导入（P18）：
 * 解析 Excel/CSV 花名册生成预览（含已存在/将新增/部门是否自动创建标注），
 * 前端确认后按行建档：部门按名称匹配、不存在则自动创建（编码后端生成），工号自动生成。
 */
@Injectable()
export class EmployeesImportService {
  constructor(
    @InjectCompanyRepo(Employee) private readonly employeeRepo: CompanyScopedRepository<Employee>,
    @InjectCompanyRepo(Department) private readonly deptRepo: CompanyScopedRepository<Department>,
    private readonly employeesService: EmployeesService,
  ) {}

  async parseFile(buffer: Buffer, originalName: string): Promise<any> {
    const grid = readSheetGrid(buffer, originalName)
    if (!grid.length) throw new BadRequestException('文件内容为空')

    const headerIndex = findHeaderRow(grid, ['姓名'], ['部门', '身份证', '手机', '岗位'])
    if (headerIndex < 0) {
      throw new BadRequestException('未识别到花名册表头（需含「姓名」列，建议包含部门/身份证号/手机号等）')
    }
    const colMap = mapColumns(grid[headerIndex], COLUMN_RULES)
    if (colMap.name === undefined) throw new BadRequestException('表头缺少「姓名」列')

    const departments = await this.deptRepo.find()
    const deptByName = new Map(departments.map((d) => [d.name.trim(), d]))

    const rows: EmployeeImportRow[] = []
    const seen = new Set<string>()
    for (let i = headerIndex + 1; i < grid.length; i++) {
      const line = grid[i] ?? []
      const name = cellText(line[colMap.name])
      if (!name || isSummaryRow(name)) continue

      const idCard = cellText(line[colMap.idCard !== undefined ? colMap.idCard : -1])
      const phone = cellText(line[colMap.phone !== undefined ? colMap.phone : -1])
      const departmentName = colMap.department !== undefined ? cellText(line[colMap.department]) : ''
      const genderLabel = colMap.gender !== undefined ? cellText(line[colMap.gender]) : ''
      const baseSalary = colMap.baseSalary !== undefined ? toNum(line[colMap.baseSalary]) : 0

      const messages: string[] = []
      // 与文件内前序行判重
      const dedupeKey = idCard || name
      if (seen.has(dedupeKey)) messages.push('文件内重复，导入时将跳过')
      seen.add(dedupeKey)

      // 档案匹配：优先身份证号，其次姓名
      const existing = await this.matchExisting(name, idCard)
      if (existing) messages.push('档案已存在，导入时将跳过')

      // 部门匹配
      let departmentWillCreate = false
      if (departmentName && !deptByName.has(departmentName.trim())) {
        departmentWillCreate = true
        messages.push(`部门「${departmentName.trim()}」不存在，确认导入时自动创建`)
      }

      const gender = this.mapGender(genderLabel)
      if (genderLabel && !gender) messages.push(`性别「${genderLabel}」无法识别，按未知处理`)

      const employmentTypeLabel = colMap.employmentType !== undefined ? cellText(line[colMap.employmentType]) : ''
      const employmentType = this.mapEmploymentType(employmentTypeLabel)
      if (employmentTypeLabel && !employmentType) {
        messages.push(`用工性质「${employmentTypeLabel}」无法识别，按全职处理`)
      }

      rows.push({
        rowIndex: i + 1,
        name: name.slice(0, 50),
        gender: gender || 'unknown',
        genderLabel,
        idCard,
        phone,
        departmentName: departmentName.trim(),
        position: colMap.position !== undefined ? cellText(line[colMap.position]) : '',
        employmentType: employmentType || '',
        employmentTypeLabel,
        bankName: colMap.bankName !== undefined ? cellText(line[colMap.bankName]) : '',
        bankAccount: colMap.bankAccount !== undefined ? cellText(line[colMap.bankAccount]) : '',
        hireDate: colMap.hireDate !== undefined ? excelDateToStr(line[colMap.hireDate]) : '',
        baseSalary: round2(baseSalary),
        exists: !!existing,
        existingId: existing?.id ?? null,
        departmentWillCreate,
        message: messages.join('；') || undefined,
      })
    }

    const newCount = rows.filter((r) => !r.exists).length
    return {
      rows,
      summary: {
        total: rows.length,
        exists: rows.length - newCount,
        newCount,
        newDepartments: [...new Set(rows.filter((r) => r.departmentWillCreate).map((r) => r.departmentName))],
      },
    }
  }

  /** 确认导入：部门不存在自动创建，员工复用建档链路（工号后端自动生成） */
  async commit(dto: CommitEmployeesImportDto): Promise<{
    created: number
    skipped: number
    failed: number
    results: Array<{ index: number; success: boolean; id?: string; code?: string; name?: string; skipped?: boolean; message?: string }>
  }> {
    const results: Array<{ index: number; success: boolean; id?: string; code?: string; name?: string; skipped?: boolean; message?: string }> = []
    for (let index = 0; index < dto.rows.length; index++) {
      const row = dto.rows[index]
      try {
        const existing = await this.matchExisting(row.name, row.idCard ?? '')
        if (existing) {
          results.push({ index, success: true, skipped: true, id: existing.id, name: row.name, message: '档案已存在，跳过' })
          continue
        }
        const departmentId = await this.ensureDepartment(row.departmentName ?? '')
        const saved = await this.employeesService.create({
          name: row.name,
          gender: row.gender || 'unknown',
          employmentType: row.employmentType || 'full_time',
          departmentId: departmentId ?? undefined,
          position: row.position || undefined,
          idCard: row.idCard || undefined,
          phone: row.phone || undefined,
          hireDate: row.hireDate || undefined,
          baseSalary: row.baseSalary ?? 0,
          bankName: row.bankName || undefined,
          bankAccount: row.bankAccount || undefined,
        })
        results.push({ index, success: true, id: saved.id, code: saved.code, name: saved.name })
      } catch (err) {
        results.push({ index, success: false, name: row.name, message: (err as Error).message })
      }
    }
    const created = results.filter((r) => r.success && !r.skipped).length
    const skipped = results.filter((r) => r.skipped).length
    return { created, skipped, failed: results.length - created - skipped, results }
  }

  // ==================== 内部 ====================

  private async matchExisting(name: string, idCard: string) {
    if (idCard) {
      const byId = await this.employeeRepo.findOne({ where: { idCard } })
      if (byId) return byId
    }
    return this.employeeRepo.findOne({ where: { name } })
  }

  private mapGender(label: string): string {
    if (!label) return ''
    if (/^男$|^男性$/.test(label)) return 'male'
    if (/^女$|^女性$/.test(label)) return 'female'
    return ''
  }

  /** 用工性质映射：全职/兼职（兼容「临时工」「非全日制」归入兼职） */
  private mapEmploymentType(label: string): string {
    if (!label) return ''
    if (/全职|正式/.test(label)) return 'full_time'
    if (/兼职|临时|非全日制|小时工|劳务/.test(label)) return 'part_time'
    return ''
  }

  /** 按名称取部门，不存在则自动创建（编码后端生成 D####） */
  private async ensureDepartment(name: string): Promise<string | null> {
    if (!name) return null
    const found = await this.deptRepo.findOne({ where: { name } })
    if (found) return found.id
    const code = await nextCode(this.deptRepo, CODE_PREFIX.department)
    const created = await this.deptRepo.save(this.deptRepo.create({ code, name, status: 1 }))
    return created.id
  }
}
