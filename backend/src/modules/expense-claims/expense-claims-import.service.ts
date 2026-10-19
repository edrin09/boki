import { BadRequestException, Injectable } from '@nestjs/common'
import { Employee, ExpenseClaim } from '../../entities/hr.entity'
import { ExpenseClaimStatus } from '../../common/enums'
import { CompanyScopedRepository } from '../../common/company/company.repository'
import { InjectCompanyRepo } from '../../common/company/company-repo.decorator'
import { ExpenseClaimsService } from './expense-claims.service'
import type { Operator } from '../cash-bank/cash-bank.service'
import type { CommitClaimsImportDto } from './dto/expense-claim-import.dto'
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
} from '../../common/utils/sheet-import.util'

/** 报销单列规则 */
const COLUMN_RULES = [
  { key: 'claimNo', keywords: ['单号', '报销单号', '编号'] },
  { key: 'employee', keywords: ['报销人', '员工姓名', '姓名', '员工'] },
  { key: 'department', keywords: ['部门', '所属部门'] },
  { key: 'payMethod', keywords: ['支付方式', '付款方式', '方式'] },
  { key: 'amount', keywords: ['金额合计', '合计金额', '报销金额', '金额'] },
  { key: 'summary', keywords: ['费用说明', '事由', '摘要', '用途', '备注'] },
  { key: 'status', keywords: ['状态'] },
  { key: 'date', keywords: ['报销日期', '日期', '时间'] },
]

export interface ClaimImportRow {
  rowIndex: number
  claimNo: string
  /** 单号在库中已存在，导入时将自动生成新单号 */
  claimNoTaken: boolean
  claimDate: string
  employeeName: string
  matched: boolean
  employeeId: string | null
  departmentName: string
  payMethod: 'advance' | 'cash' | 'bank'
  payMethodLabel: string
  amount: number
  summary: string
  statusLabel: string
  /** 库中存在同人同日同金额的报销单，疑似重复 */
  duplicate: boolean
  message?: string
}

/**
 * 报销单导入（P18）：
 * 解析 Excel/CSV 报销单生成预览（报销人匹配档案、支付方式映射、单号/重复校验），
 * 前端确认后按行生成报销单草稿（单明细行，费用科目落库时默认取管理费用 6602），
 * 审核后经既有链路生成费用凭证；员工垫付方式审核时自动挂「其他应收款-员工」。
 */
@Injectable()
export class ExpenseClaimsImportService {
  constructor(
    @InjectCompanyRepo(ExpenseClaim) private readonly repo: CompanyScopedRepository<ExpenseClaim>,
    @InjectCompanyRepo(Employee) private readonly employeeRepo: CompanyScopedRepository<Employee>,
    private readonly claimsService: ExpenseClaimsService,
  ) {}

  async parseFile(buffer: Buffer, originalName: string): Promise<any> {
    const grid = readSheetGrid(buffer, originalName)
    if (!grid.length) throw new BadRequestException('文件内容为空')

    const headerIndex = findHeaderRow(grid, ['报销人', '姓名'], ['金额', '报销', '日期'])
    if (headerIndex < 0) {
      throw new BadRequestException('未识别到报销单表头（需含「报销人」与「金额/报销日期」列）')
    }
    const colMap = mapColumns(grid[headerIndex], COLUMN_RULES)
    if (colMap.employee === undefined) throw new BadRequestException('表头缺少「报销人」列')
    if (colMap.amount === undefined) throw new BadRequestException('表头缺少「金额合计」列')
    if (colMap.date === undefined) throw new BadRequestException('表头缺少「报销日期」列')

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

  /** 确认导入：逐行生成报销单草稿（审核后才出账） */
  async commit(
    dto: CommitClaimsImportDto,
    operator: Operator,
  ): Promise<{ created: number; failed: number; results: Array<{ index: number; success: boolean; id?: string; claimNo?: string; employeeName?: string; message?: string }> }> {
    const results: Array<{ index: number; success: boolean; id?: string; claimNo?: string; employeeName?: string; message?: string }> = []
    for (let index = 0; index < dto.rows.length; index++) {
      const row = dto.rows[index]
      try {
        const saved = await this.claimsService.create(
          {
            claimNo: row.claimNo || undefined,
            claimDate: row.claimDate,
            employeeId: row.employeeId,
            payMethod: row.payMethod,
            items: [{ summary: row.summary || '报销', amount: row.amount }],
            remark: '报销单导入',
          },
          operator,
        )
        results.push({ index, success: true, id: saved.id, claimNo: saved.claimNo, employeeName: saved.employeeName })
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
  ): Promise<ClaimImportRow[]> {
    const employees = await this.employeeRepo.find()
    const byName = employees.filter((e) => e.status === 1)
    const rows: ClaimImportRow[] = []
    const noSeen = new Set<string>()

    for (let i = headerIndex + 1; i < grid.length; i++) {
      const line = grid[i] ?? []
      const employeeName = colMap.employee !== undefined ? cellText(line[colMap.employee]) : ''
      const amount = round2(toNum(line[colMap.amount]))
      if (!employeeName && amount <= 0) continue
      if (employeeName && isSummaryRow(employeeName)) continue

      const claimNo = colMap.claimNo !== undefined ? cellText(line[colMap.claimNo]) : ''
      const claimDate = excelDateToStr(line[colMap.date])
      const payMethodLabel = colMap.payMethod !== undefined ? cellText(line[colMap.payMethod]) : ''
      const statusLabel = colMap.status !== undefined ? cellText(line[colMap.status]) : ''

      const messages: string[] = []
      if (!claimDate) messages.push('报销日期无法识别')
      if (amount <= 0) messages.push('报销金额必须大于 0')

      // 报销人匹配在职档案
      const employee = byName.find((e) => e.name === employeeName)
      if (!employee) messages.push(`未匹配到在职员工档案「${employeeName}」，请手工选择`)

      // 单号校验
      let claimNoTaken = false
      if (claimNo) {
        if (noSeen.has(claimNo)) messages.push('单号在文件内重复，导入时将自动生成新单号')
        else noSeen.add(claimNo)
        const existsInDb = await this.repo.findOne({ where: { claimNo } })
        if (existsInDb) {
          claimNoTaken = true
          messages.push('单号已存在，导入时将自动生成新单号')
        }
      }

      // 疑似重复：同人同日同金额
      let duplicate = false
      if (employee && claimDate && amount > 0) {
        const dup = await this.repo.findOne({
          where: { employeeId: employee.id, claimDate, totalAmount: amount as any },
        })
        if (dup && dup.status !== ExpenseClaimStatus.REJECTED) {
          duplicate = true
          messages.push(`与已有报销单 ${dup.claimNo} 同人同日同金额，请确认是否重复导入`)
        }
      }

      rows.push({
        rowIndex: i + 1,
        claimNo: claimNoTaken ? '' : claimNo,
        claimNoTaken,
        claimDate,
        employeeName: employeeName.slice(0, 50),
        matched: !!employee,
        employeeId: employee?.id ?? null,
        departmentName: colMap.department !== undefined ? cellText(line[colMap.department]) : '',
        payMethod: this.mapPayMethod(payMethodLabel),
        payMethodLabel,
        amount,
        summary: colMap.summary !== undefined ? cellText(line[colMap.summary]) : '',
        statusLabel,
        duplicate,
        message: messages.join('；') || undefined,
      })
    }
    return rows
  }

  /** 支付方式：现金→cash，银行→bank，垫付/挂账→advance，默认 advance（员工垫付） */
  private mapPayMethod(label: string): 'advance' | 'cash' | 'bank' {
    if (/现金/.test(label)) return 'cash'
    if (/银行|转账/.test(label)) return 'bank'
    return 'advance'
  }
}
