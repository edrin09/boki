import { BadRequestException, Injectable } from '@nestjs/common'
import * as XLSX from 'xlsx'
import { Employee } from '@core/entities/hr.entity'
import { CompanyScopedRepository } from '@core/common/company/company.repository'
import { InjectCompanyRepo } from '@core/common/company/company-repo.decorator'
import { DocumentParseService } from '@plugin/ocr/server/modules/ocr/document-parse.service'
import { PayrollService } from './payroll.service'
import type { CommitPayrollImportDto } from './dto/payroll-import.dto'
import type { Operator } from '@core/common/types/operator'

/** 工资明细字段 */
type SalaryField =
  | 'name'
  | 'baseSalary'
  | 'performance'
  | 'allowance'
  | 'overtime'
  | 'insurancePersonal'
  | 'fundPersonal'
  | 'tax'
  | 'otherDeduct'
  | 'gross'
  | 'net'

/** 表头关键词 → 字段（按顺序优先匹配，列不重复使用） */
const COLUMN_RULES: Array<{ field: SalaryField; keywords: string[] }> = [
  { field: 'name', keywords: ['姓名', '员工姓名', '员工', '名字'] },
  { field: 'baseSalary', keywords: ['基本工资', '基础工资', '底薪', '岗位工资', '基本'] },
  { field: 'performance', keywords: ['绩效工资', '绩效', '奖金', '提成'] },
  { field: 'allowance', keywords: ['补贴', '津贴', '补助', '餐补', '交通补贴'] },
  { field: 'overtime', keywords: ['加班'] },
  { field: 'insurancePersonal', keywords: ['个人社保', '社保', '养老保险', '医疗保险', '失业保险'] },
  { field: 'fundPersonal', keywords: ['公积金', '住房公积金'] },
  { field: 'tax', keywords: ['个人所得税', '个税', '所得税'] },
  { field: 'otherDeduct', keywords: ['其他扣款', '其他扣除', '其他代扣', '代扣', '扣款'] },
  { field: 'gross', keywords: ['应发工资', '应发', '工资总额'] },
  { field: 'net', keywords: ['实发工资', '实发', '到手'] },
]

export interface PayrollImportRow {
  rowIndex: number
  employeeName: string
  matched: boolean
  employeeId: string | null
  baseSalary: number
  performance: number
  allowance: number
  overtime: number
  insurancePersonal: number
  fundPersonal: number
  tax: number
  otherDeduct: number
  gross: number
  net: number
  fromOcr?: boolean
  message?: string
}

/**
 * 工资表导入（P17.7）：
 * Excel/CSV 按表头关键词映射解析；图片/PDF 走 OCR 文本行解析（尽力而为，标注 fromOcr 供人工核对）。
 * 解析结果只生成「预览」，由前端确认后调用 commit 落库为工资单草稿。
 */
@Injectable()
export class PayrollImportService {
  constructor(
    @InjectCompanyRepo(Employee) private readonly employeeRepo: CompanyScopedRepository<Employee>,
    private readonly documentParse: DocumentParseService,
    private readonly payrollService: PayrollService,
  ) {}

  /** 解析文件为工资预览行 */
  async parseFile(buffer: Buffer, mimeType: string, originalName: string): Promise<any> {
    const isSheet =
      /sheet|excel|csv|octet-stream/.test(mimeType) ||
      /\.(xlsx|xls|csv)$/i.test(originalName)
    const isOcr = /^image\//.test(mimeType) || mimeType === 'application/pdf'

    let rows: PayrollImportRow[]
    if (isSheet) {
      const grid = this.parseSheetGrid(buffer, originalName)
      rows = await this.rowsFromGrid(grid)
    } else if (isOcr) {
      rows = await this.rowsFromOcr(buffer, mimeType)
    } else {
      throw new BadRequestException('不支持的文件类型，请上传 Excel/CSV 或图片/PDF 工资表')
    }

    const rowsOut = rows.filter((r) => r.employeeName)
    const matched = rowsOut.filter((r) => r.matched).length
    const totalGross = rowsOut.reduce((a, r) => a + r.gross, 0)
    const totalNet = rowsOut.reduce((a, r) => a + r.net, 0)
    const unmatched = rowsOut
      .filter((r) => !r.matched)
      .map((r) => r.employeeName)

    return {
      rows: rowsOut,
      summary: {
        total: rowsOut.length,
        matched,
        unmatched: rowsOut.length - matched,
        unmatchedNames: unmatched,
        totalGross: this.round(totalGross),
        totalNet: this.round(totalNet),
      },
    }
  }

  /** 确认导入：按预览行生成工资单草稿（复用工资保存链路） */
  async commit(dto: CommitPayrollImportDto, operator: Operator): Promise<any> {
    const items = dto.rows.map((r) => ({
      employeeId: r.employeeId,
      baseSalary: r.baseSalary,
      performance: r.performance ?? 0,
      allowance: r.allowance ?? 0,
      overtime: r.overtime ?? 0,
      insurancePersonal: r.insurancePersonal ?? 0,
      fundPersonal: r.fundPersonal ?? 0,
      tax: r.tax ?? 0,
      otherDeduct: r.otherDeduct ?? 0,
    }))
    return this.payrollService.save(
      { period: dto.period, payDate: dto.payDate, items, remark: dto.remark ?? '工资表导入' },
      operator,
    )
  }

  // ==================== 表格解析 ====================

  private parseSheetGrid(buffer: Buffer, originalName: string): string[][] {
    if (/\.csv$/i.test(originalName) || /^text\/csv/.test(originalName)) {
      return this.parseCsvGrid(buffer)
    }
    const wb = XLSX.read(buffer, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][]
  }

  private parseCsvGrid(buffer: Buffer): string[][] {
    const text = this.decodeCsv(buffer)
    return text
      .split(/\r?\n/)
      .map((line) =>
        line.split(/[,，\t]/).map((cell) => cell.trim().replace(/^["']|["']$/g, '')),
      )
  }

  private decodeCsv(buffer: Buffer): string {
    const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
    if ((utf8.match(/\uFFFD/g) ?? []).length === 0) return utf8
    try {
      return new TextDecoder('gbk').decode(buffer)
    } catch {
      return utf8
    }
  }

  private async rowsFromGrid(grid: string[][]): Promise<PayrollImportRow[]> {
    if (!grid.length) throw new BadRequestException('文件内容为空')

    const headerIndex = this.findHeaderRow(grid)
    if (headerIndex < 0) throw new BadRequestException('未识别到工资表表头（需含「姓名」与工资列）')

    const colMap = this.mapColumns(grid[headerIndex])
    if (colMap.name === undefined) throw new BadRequestException('表头缺少「姓名」列')

    const rows: PayrollImportRow[] = []
    for (let i = headerIndex + 1; i < grid.length; i++) {
      const line = grid[i]
      const name = this.cellText(line[colMap.name])
      if (!name) continue
      if (/^(合计|小计|总计|汇总)/.test(name)) continue

      const values = this.extractValues(line, colMap)
      const row = this.buildRow(i + 1, name, values)
      row.employeeId = await this.matchEmployeeId(row, values)
      // 无金额且未匹配档案的空行直接跳过
      if (!row.matched && row.gross <= 0 && row.net <= 0) continue
      rows.push(row)
    }
    return rows
  }

  /** 定位表头行：包含「姓名/员工」且至少命中一个工资列关键词 */
  private findHeaderRow(grid: string[][]): number {
    for (let i = 0; i < Math.min(grid.length, 10); i++) {
      const line = grid[i] ?? []
      const joined = line.join('')
      const hasName = /姓名|员工|名字/.test(joined)
      const moneyHits = COLUMN_RULES.filter((r) => r.field !== 'name').filter((r) =>
        r.keywords.some((k) => line.some((cell) => this.cellText(cell).includes(k))),
      ).length
      if (hasName && moneyHits >= 1) return i
    }
    return -1
  }

  private mapColumns(header: string[]): Partial<Record<SalaryField, number>> {
    const map: Partial<Record<SalaryField, number>> = {}
    const used = new Set<number>()
    for (const rule of COLUMN_RULES) {
      for (let i = 0; i < header.length; i++) {
        if (used.has(i)) continue
        if (rule.keywords.some((k) => this.cellText(header[i]).includes(k))) {
          map[rule.field] = i
          used.add(i)
          break
        }
      }
    }
    return map
  }

  private extractValues(
    line: string[],
    colMap: Partial<Record<SalaryField, number>>,
  ): Partial<Record<SalaryField, number>> {
    const out: Partial<Record<SalaryField, number>> = {}
    for (const field of Object.keys(colMap) as SalaryField[]) {
      if (field === 'name' || field === 'gross' || field === 'net') continue
      out[field] = this.toNum(line[colMap[field]!])
    }
    return out
  }

  private buildRow(
    rowIndex: number,
    employeeName: string,
    values: Partial<Record<SalaryField, number>>,
  ): PayrollImportRow {
    const baseSalary = values.baseSalary ?? 0
    const performance = values.performance ?? 0
    const allowance = values.allowance ?? 0
    const overtime = values.overtime ?? 0
    const insurancePersonal = values.insurancePersonal ?? 0
    const fundPersonal = values.fundPersonal ?? 0
    const tax = values.tax ?? 0
    const otherDeduct = values.otherDeduct ?? 0
    const gross = this.round(baseSalary + performance + allowance + overtime)
    const deduct = insurancePersonal + fundPersonal + tax + otherDeduct
    const net = this.round(gross - deduct)

    const messages: string[] = []
    if (gross < 0) messages.push('应发工资为负，请检查')
    if (deduct > gross) messages.push(`代扣合计（${this.round(deduct)}）超过应发工资（${gross}）`)

    return {
      rowIndex,
      employeeName: employeeName.slice(0, 100),
      matched: false,
      employeeId: null,
      baseSalary,
      performance,
      allowance,
      overtime,
      insurancePersonal,
      fundPersonal,
      tax,
      otherDeduct,
      gross,
      net,
      message: messages.join('；') || undefined,
    }
  }

  private async matchEmployeeId(
    row: PayrollImportRow,
    values: Partial<Record<SalaryField, number>>,
  ): Promise<string | null> {
    const employee = await this.employeeRepo.findOne({ where: { name: row.employeeName } })
    if (employee) {
      row.matched = true
      row.message = undefined
      return employee.id
    }
    row.matched = false
    row.message = `未匹配到员工档案「${row.employeeName}」，请在员工管理中确认姓名`
    void values
    return null
  }

  // ==================== OCR 文本解析（尽力而为） ====================

  private async rowsFromOcr(buffer: Buffer, mimeType: string): Promise<PayrollImportRow[]> {
    const { rawText } = await this.documentParse.parse(buffer, mimeType)
    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)

    const headerIdx = lines.findIndex((l) => {
      const hasName = /姓名|员工/.test(l)
      const moneyHits = COLUMN_RULES.filter((r) => r.field !== 'name').filter((r) =>
        r.keywords.some((k) => l.includes(k)),
      ).length
      return hasName && moneyHits >= 1
    })
    if (headerIdx < 0) throw new BadRequestException('OCR 未能识别工资表表头，请改用 Excel/CSV 上传')

    const header = lines[headerIdx]
    const order = COLUMN_RULES.filter((r) => r.field !== 'name')
      .filter((r) => r.keywords.some((k) => header.includes(k)))
      .map((r) => r.field)

    const rows: PayrollImportRow[] = []
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i]
      if (/^(合计|小计|总计|汇总)/.test(line)) continue
      const numbers = [...line.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[1]))
      const nameMatch = line.match(/^([^\d]+)/)
      const employeeName = (nameMatch?.[1] ?? '').trim().replace(/[|｜:：,，。\s]+$/, '')
      if (!employeeName || !numbers.length) continue

      const values: Partial<Record<SalaryField, number>> = {}
      order.forEach((field, idx) => {
        values[field] = numbers[idx]
      })
      const row = this.buildRow(i + 1, employeeName, values)
      row.fromOcr = true
      row.message = row.message ? `${row.message}；OCR 识别，请核对金额` : 'OCR 识别，请核对金额'
      row.employeeId = await this.matchEmployeeId(row, values)
      rows.push(row)
    }
    return rows
  }

  // ==================== 工具 ====================

  private cellText(v: unknown): string {
    if (v === null || v === undefined) return ''
    return String(v).trim()
  }

  private toNum(v: unknown): number {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0
    if (v === null || v === undefined) return 0
    const s = String(v).replace(/[,，￥¥\s]/g, '').trim()
    if (!s) return 0
    const n = Number(s)
    return Number.isFinite(n) ? n : 0
  }

  private round(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100
  }
}
