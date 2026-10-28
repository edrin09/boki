import { BadRequestException, Injectable } from '@nestjs/common'
import { Employee, Loan } from '@core/entities/hr.entity'
import { LoanStatus } from '@core/common/enums'
import { CompanyScopedRepository } from '@core/common/company/company.repository'
import { InjectCompanyRepo } from '@core/common/company/company-repo.decorator'
import { LoansService } from './loans.service'
import type { Operator } from '@core/common/types/operator'
import type { CommitLoansImportDto } from './dto/loan-import.dto'
import {
  cellText,
  excelDateToStr,
  findHeaderRow,
  isSummaryRow,
  mapColumns,
  readSheetGrid,
  round2,
  toNum,
  type SheetGrid,
} from '@core/common/utils/sheet-import.util'

/** 借款单列规则 */
const COLUMN_RULES = [
  { key: 'loanNo', keywords: ['单号', '借款单号', '编号'] },
  { key: 'employee', keywords: ['借款人', '员工姓名', '姓名', '员工'] },
  { key: 'department', keywords: ['部门', '所属部门'] },
  { key: 'reason', keywords: ['借款事由', '事由', '用途', '摘要'] },
  { key: 'payMethod', keywords: ['借款方式', '方式', '支付方式'] },
  { key: 'amount', keywords: ['借款金额', '金额', '借款数'] },
  { key: 'status', keywords: ['状态'] },
  { key: 'date', keywords: ['借款日期', '日期', '时间'] },
]

export interface LoanImportRow {
  rowIndex: number
  loanNo: string
  /** 单号在库中已存在，导入时将自动生成新单号 */
  loanNoTaken: boolean
  loanDate: string
  employeeName: string
  matched: boolean
  employeeId: string | null
  departmentName: string
  reason: string
  payMethod: 'cash' | 'bank'
  payMethodLabel: string
  amount: number
  statusLabel: string
  /** 库中存在同人同日同金额的借款单，疑似重复 */
  duplicate: boolean
  message?: string
}

/**
 * 借款单导入（P18）：
 * 解析 Excel/CSV 借款单生成预览（借款人匹配档案、单号/重复校验），
 * 前端确认后按行生成借款单草稿——沿用「导入先进待确认，审核后出账」的约定，
 * 审核时经既有链路生成借款凭证并登记员工往来。
 */
@Injectable()
export class LoansImportService {
  constructor(
    @InjectCompanyRepo(Loan) private readonly repo: CompanyScopedRepository<Loan>,
    @InjectCompanyRepo(Employee) private readonly employeeRepo: CompanyScopedRepository<Employee>,
    private readonly loansService: LoansService,
  ) {}

  async parseFile(buffer: Buffer, originalName: string): Promise<any> {
    const grid = readSheetGrid(buffer, originalName)
    if (!grid.length) throw new BadRequestException('文件内容为空')

    const headerIndex = findHeaderRow(grid, ['借款人', '姓名'], ['金额', '借款', '日期'])
    if (headerIndex < 0) {
      throw new BadRequestException('未识别到借款单表头（需含「借款人」与「金额/借款日期」列）')
    }
    const colMap = mapColumns(grid[headerIndex], COLUMN_RULES)
    if (colMap.employee === undefined) throw new BadRequestException('表头缺少「借款人」列')
    if (colMap.amount === undefined) throw new BadRequestException('表头缺少「借款金额」列')
    if (colMap.date === undefined) throw new BadRequestException('表头缺少「借款日期」列')

    const rows = await this.rowsFromGrid(grid, headerIndex, colMap)

    const matched = rows.filter((r) => r.matched).length
    return {
      rows,
      summary: {
        total: rows.length,
        matched,
        unmatched: rows.length - matched,
        unmatchedNames: rows.filter((r) => !r.matched).map((r) => r.employeeName),
        totalAmount: round2(rows.reduce((a, r) => a + r.amount, 0)),
        duplicates: rows.filter((r) => r.duplicate).length,
      },
    }
  }

  /** 确认导入：逐行生成借款单草稿（审核后才出账） */
  async commit(
    dto: CommitLoansImportDto,
    operator: Operator,
  ): Promise<{ created: number; failed: number; results: Array<{ index: number; success: boolean; id?: string; loanNo?: string; employeeName?: string; message?: string }> }> {
    const results: Array<{ index: number; success: boolean; id?: string; loanNo?: string; employeeName?: string; message?: string }> = []
    for (let index = 0; index < dto.rows.length; index++) {
      const row = dto.rows[index]
      try {
        const saved = await this.loansService.create(
          {
            loanNo: row.loanNo || undefined,
            loanDate: row.loanDate,
            employeeId: row.employeeId,
            amount: row.amount,
            reason: row.reason || undefined,
            payMethod: row.payMethod,
          },
          operator,
        )
        results.push({ index, success: true, id: saved.id, loanNo: saved.loanNo, employeeName: saved.employeeName })
      } catch (err) {
        results.push({ index, success: false, employeeName: row.employeeName, message: (err as Error).message })
      }
    }
    const created = results.filter((r) => r.success).length
    return { created, failed: results.length - created, results }
  }

  // ==================== 解析 ====================

  private async rowsFromGrid(
    grid: SheetGrid,
    headerIndex: number,
    colMap: Record<string, number>,
  ): Promise<LoanImportRow[]> {
    const employees = await this.employeeRepo.find()
    const byName = employees.filter((e) => e.status === 1)
    const rows: LoanImportRow[] = []
    const noSeen = new Map<string, number>()

    for (let i = headerIndex + 1; i < grid.length; i++) {
      const line = grid[i] ?? []
      const employeeName = colMap.employee !== undefined ? cellText(line[colMap.employee]) : ''
      const amount = round2(toNum(line[colMap.amount]))
      if (!employeeName && amount <= 0) continue
      if (employeeName && isSummaryRow(employeeName)) continue

      const loanNo = colMap.loanNo !== undefined ? cellText(line[colMap.loanNo]) : ''
      const loanDate = excelDateToStr(line[colMap.date])
      const payMethodLabel = colMap.payMethod !== undefined ? cellText(line[colMap.payMethod]) : ''
      const statusLabel = colMap.status !== undefined ? cellText(line[colMap.status]) : ''

      const messages: string[] = []
      if (!loanDate) messages.push('借款日期无法识别')
      if (amount <= 0) messages.push('借款金额必须大于 0')

      // 借款人匹配在职档案
      const employee = byName.find((e) => e.name === employeeName)
      if (!employee) messages.push(`未匹配到在职员工档案「${employeeName}」，请手工选择`)

      // 单号校验：文件内重复 / 库中已占用
      let loanNoTaken = false
      if (loanNo) {
        if (noSeen.has(loanNo)) messages.push('单号在文件内重复，导入时将自动生成新单号')
        else noSeen.set(loanNo, i)
        const existsInDb = await this.repo.findOne({ where: { loanNo } })
        if (existsInDb) {
          loanNoTaken = true
          messages.push('单号已存在，导入时将自动生成新单号')
        }
      }

      // 疑似重复：同人同日同金额
      let duplicate = false
      if (employee && loanDate && amount > 0) {
        const dup = await this.repo.findOne({
          where: { employeeId: employee.id, loanDate, amount: amount as any },
        })
        if (dup && dup.status !== LoanStatus.REJECTED) {
          duplicate = true
          messages.push(`与已有借款单 ${dup.loanNo} 同人同日同金额，请确认是否重复导入`)
        }
      }

      rows.push({
        rowIndex: i + 1,
        loanNo: loanNoTaken ? '' : loanNo,
        loanNoTaken,
        loanDate,
        employeeName: employeeName.slice(0, 50),
        matched: !!employee,
        employeeId: employee?.id ?? null,
        departmentName: colMap.department !== undefined ? cellText(line[colMap.department]) : '',
        reason: colMap.reason !== undefined ? cellText(line[colMap.reason]) : '',
        payMethod: this.mapPayMethod(payMethodLabel),
        payMethodLabel,
        amount,
        statusLabel,
        duplicate,
        message: messages.join('；') || undefined,
      })
    }
    return rows
  }

  /** 借款方式：银行转账/银行→bank，现金→cash，默认 bank */
  private mapPayMethod(label: string): 'cash' | 'bank' {
    if (/现金/.test(label)) return 'cash'
    return 'bank'
  }
}
