import { existsSync } from 'node:fs'
import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import PDFDocument from 'pdfkit'
import { Company } from '../../entities/company.entity'
import {
  ExpenseClaim,
  ExpenseClaimItem,
  Loan,
  Payroll,
  PayrollItem,
} from '../../entities/hr.entity'

/** 金额千分位格式化 */
export function fmtMoney(n: number | null | undefined): string {
  const v = Number(n ?? 0)
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** 4 位数字节转中文（0-9999，不带万/亿） */
function sectionToWords(num: number): string {
  const digits = '零壹贰叁肆伍陆柒捌玖'
  const units = ['', '拾', '佰', '仟']
  let s = ''
  let zeroPending = false
  for (let i = 3; i >= 0; i--) {
    const d = Math.floor(num / 10 ** i) % 10
    if (d === 0) {
      if (s) zeroPending = true
    } else {
      if (zeroPending) {
        s += '零'
        zeroPending = false
      }
      s += digits[d] + units[i]
    }
  }
  return s
}

/**
 * 人民币大写金额：1234.56 → 壹仟贰佰叁拾肆圆伍角陆分
 * 整数部分为零时直接从角分读起；无角分时以「整」结尾。
 */
export function amountInWords(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return ''
  const v = Math.round(Math.abs(Number(n)) * 100)
  if (v === 0) return '零圆整'
  const yuan = Math.floor(v / 100)
  const jiao = Math.floor((v % 100) / 10)
  const fen = v % 10
  const digits = '零壹贰叁肆伍陆柒捌玖'

  const groups: number[] = []
  let rest = yuan
  while (rest > 0) {
    groups.unshift(rest % 10000)
    rest = Math.floor(rest / 10000)
  }
  const groupUnits = ['', '万', '亿', '万亿']
  let out = ''
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]
    if (g === 0) continue
    // 非首段且当前段不足 1000 时补「零」（如 10001 → 壹万零壹）
    const leadingZero = out && g < 1000 ? '零' : ''
    out += leadingZero + sectionToWords(g) + groupUnits[groups.length - 1 - i]
  }

  let words = out
  if (words) words += '圆'
  if (jiao === 0 && fen === 0) {
    words += '整'
  } else {
    if (jiao > 0) words += digits[jiao] + '角'
    else if (words && fen > 0) words += '零'
    if (fen > 0) words += digits[fen] + '分'
  }
  return words
}

/** 表格列定义 */
interface PdfColumn {
  key?: string
  label: string
  width: number
  align?: 'left' | 'right' | 'center'
  text?: (row: any, index?: number) => string
}

const LM = 32 // 左右边距
const COLOR_MUTED = '#666666'
/** A5 横向尺寸（pt）：210×148mm */
const A5_LANDSCAPE: [number, number] = [595.28, 419.53]

/**
 * 单据主题色（一眼区分单据类型的视觉锚点）：
 * main 用于顶部横幅与金额强调，light 用于表头/金额条底纹。
 * 报销单-绿（费用支出）、借款单-蓝（资金往来）、工资表-青（薪酬）。
 */
const THEMES = {
  claim: { main: '#1F7A4D', light: '#E9F4EE' },
  loan: { main: '#1D4E89', light: '#E9F1F9' },
  payroll: { main: '#0F6B6B', light: '#E8F3F3' },
} as const
type ThemeKey = keyof typeof THEMES

/** 圆形色章内的单字：一眼区分单据类型（报/借/薪） */
const BADGE_ICON: Record<ThemeKey, string> = { claim: '报', loan: '借', payroll: '薪' }

/**
 * HR 单据 PDF 生成服务（报销单 / 借款单 / 工资表）
 *
 * 输出统一为 A5 横向幅面，可直接打印作为「原始凭证存根」：
 * 外边框 + 公司抬头 + 单据标题 + 信息栏 + 明细表 + 大写金额 + 签字栏。
 * 中文字体从系统字体目录按候选顺序自动降级（黑体优先，宋体/雅黑兜底）。
 */
@Injectable()
export class HrDocPdfService {
  private fontRegular = ''
  private fontBold = ''
  private readonly companyNameCache = new Map<string, string>()

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    // 仅使用单文件 TTF 字体（pdfkit 对 .ttc 集合字体不支持子集化），
    // 黑体本身笔画较粗，直接以字号区分标题/正文层次。
    this.fontRegular = this.pickFont(['simhei.ttf', 'simfang.ttf', 'simkai.ttf', 'Deng.ttf'])
    this.fontBold = this.pickFont(['simhei.ttf', 'Dengb.ttf', 'simfang.ttf'])
  }

  /** 按候选顺序选择第一个存在的系统字体 */
  private pickFont(names: string[]): string {
    const dirs = [process.env.WINDIR ? `${process.env.WINDIR}\\Fonts` : 'C:\\Windows\\Fonts']
    for (const dir of dirs) {
      for (const name of names) {
        const p = `${dir}\\${name}`
        if (existsSync(p)) return p
      }
    }
    // 兜底：pdfkit 内置 Helvetica（中文会缺字，仅避免崩溃）
    return ''
  }

  /** 单据所属公司名称（按 company_id 缓存） */
  private async companyNameOf(companyId: string): Promise<string> {
    if (this.companyNameCache.has(companyId)) return this.companyNameCache.get(companyId)!
    let name = ''
    try {
      const company = await this.dataSource.getRepository(Company).findOneBy({ id: companyId })
      name = company?.name ?? ''
    } catch {
      name = ''
    }
    this.companyNameCache.set(companyId, name)
    return name
  }

  // ==================== 对外渲染入口 ====================

  /** 费用报销单（A5 横向，绿色主题） */
  async expenseClaimPdf(claim: ExpenseClaim, items: ExpenseClaimItem[]): Promise<Buffer> {
    const companyName = await this.companyNameOf(claim.companyId)
    const doc = this.createDoc(A5_LANDSCAPE)
    const W = doc.page.width - LM * 2
    let y = this.drawHeader(doc, 'claim', companyName, '费　用　报　销　单', claim.claimNo) + 4

    // 信息栏
    const payMethodLabel = { advance: '员工垫付', cash: '现金', bank: '银行' }[claim.payMethod] ?? claim.payMethod
    const pairs: Array<[string, string]> = [
      ['报销日期', String(claim.claimDate).slice(0, 10)],
      ['报销人', claim.employeeName],
      ['所属部门', claim.departmentName || '—'],
      ['支付方式', payMethodLabel],
      ['付款账户', claim.bankAccountName || '—'],
    ]
    y = this.drawInfoGrid(doc, LM, y, W, pairs, 3, 64)
    if (claim.loanNo) {
      y = this.drawInfoGrid(doc, LM, y, W, [['借款抵充', `冲抵借款单 ${claim.loanNo}`]], 3, 64)
    }
    y += 4

    // 明细表
    const columns: PdfColumn[] = [
      { label: '序号', width: 36, align: 'center', text: (_r, i) => String((i ?? 0) + 1) },
      { label: '费用摘要', width: 215, align: 'left', text: (r) => r.summary || '' },
      {
        label: '费用科目',
        width: 160,
        align: 'left',
        text: (r) => (r.accountCode ? `${r.accountCode} ${r.accountName ?? ''}` : r.accountName ?? ''),
      },
      { label: '金额（元）', width: 100, align: 'right', text: (r) => fmtMoney(r.amount) },
    ]
    const tableEnd = this.drawTable(doc, LM, y, columns, items, {
      maxBottom: doc.page.height - 110,
      fontSize: 8,
      rowHeight: 20,
      theme: 'claim',
    })
    y = Math.max(tableEnd, y) + 8

    // 合计金额强调条（大写 + 小写）
    y = this.drawAmountBar(
      doc,
      LM,
      y,
      W,
      'claim',
      `合计（大写）：人民币 ${amountInWords(claim.totalAmount)}`,
      fmtMoney(claim.totalAmount),
    )
    y += 8

    // 签字栏
    this.drawSignRow(doc, LM, y, W, ['报销人', '部门负责人', '财务负责人', '总经理', '领款人'], 8)
    y += 36

    if (claim.remark) {
      doc.font(this.fontRegular).fontSize(7).fillColor(COLOR_MUTED)
      doc.text(`备注：${claim.remark}`, LM, y, { width: W, lineBreak: false })
      doc.fillColor('#000000')
    }

    return this.collect(doc)
  }

  /** 借款单（A5 横向，蓝色主题） */
  async loanPdf(loan: Loan): Promise<Buffer> {
    const companyName = await this.companyNameOf(loan.companyId)
    const doc = this.createDoc(A5_LANDSCAPE)
    const W = doc.page.width - LM * 2
    let y = this.drawHeader(doc, 'loan', companyName, '借　款　单', loan.loanNo) + 4

    const payMethodLabel = { cash: '现金', bank: '银行转账' }[loan.payMethod] ?? loan.payMethod
    const statusLabel = { draft: '草稿', approved: '已发放', repaid: '已还清', rejected: '已驳回' }[loan.status] ?? loan.status
    y = this.drawInfoGrid(
      doc,
      LM,
      y,
      W,
      [
        ['借款日期', String(loan.loanDate).slice(0, 10)],
        ['借款人', loan.employeeName],
        ['所属部门', loan.departmentName || '—'],
        ['借款方式', payMethodLabel],
        ['放款账户', loan.bankAccountName || '—'],
      ],
      3,
      64,
    )
    y += 10

    // 借款金额强调条（大写 + 小写）
    y = this.drawAmountBar(
      doc,
      LM,
      y,
      W,
      'loan',
      `借款金额（大写）：人民币 ${amountInWords(loan.amount)}`,
      fmtMoney(loan.amount),
      10.5,
    )
    y += 10

    y = this.drawInfoGrid(doc, LM, y, W, [['借款事由', loan.reason || '—']], 1, 64)
    y = this.drawInfoGrid(doc, LM, y, W, [['当前状态', statusLabel]], 1, 64)
    y += 12

    // 签字栏
    this.drawSignRow(doc, LM, y, W, ['借款人', '部门负责人', '财务负责人', '总经理', '领款人'], 8)
    y += 36

    if (loan.remark) {
      doc.font(this.fontRegular).fontSize(7).fillColor(COLOR_MUTED)
      doc.text(`备注：${loan.remark}`, LM, y, { width: W, lineBreak: false })
      doc.fillColor('#000000')
    }

    return this.collect(doc)
  }

  /** 工资表（A5 横向，青色主题，支持多行跨页） */
  async payrollPdf(payroll: Payroll, items: PayrollItem[]): Promise<Buffer> {
    const companyName = await this.companyNameOf(payroll.companyId)
    const doc = this.createDoc(A5_LANDSCAPE)
    const W = doc.page.width - LM * 2
    const periodText = `${Math.floor(payroll.period / 100)} 年 ${payroll.period % 100} 月`
    let y = this.drawHeader(doc, 'payroll', companyName, `${periodText} 工　资　表`) + 10

    y = this.drawInfoGrid(
      doc,
      LM,
      y,
      W,
      [
        ['单　　号', payroll.payrollNo],
        ['发放日期', String(payroll.payDate).slice(0, 10)],
        ['员工人数', `${payroll.employeeCount} 人`],
        ['实发合计', `￥ ${fmtMoney(payroll.totalNet)}`],
      ],
      4,
      50,
      8.5,
    )
    y += 6

    // 明细表（14 列）
    const moneyCol = (key: string, label: string, width: number): PdfColumn => ({
      key,
      label,
      width,
      align: 'right',
      text: (r) => fmtMoney(r[key]),
    })
    const columns: PdfColumn[] = [
      { key: 'employeeCode', label: '工号', width: 30, align: 'left', text: (r) => r.employeeCode ?? '' },
      { key: 'employeeName', label: '姓名', width: 32, align: 'left', text: (r) => r.employeeName ?? '' },
      { key: 'departmentName', label: '部门', width: 40, align: 'left', text: (r) => r.departmentName ?? '' },
      moneyCol('baseSalary', '基本工资', 43),
      moneyCol('performance', '绩效工资', 38),
      moneyCol('allowance', '津贴补贴', 38),
      moneyCol('overtime', '加班费', 33),
      moneyCol('gross', '应发合计', 45),
      moneyCol('insurancePersonal', '个人社保', 38),
      moneyCol('fundPersonal', '个人公积金', 38),
      moneyCol('tax', '个人所得税', 38),
      moneyCol('otherDeduct', '其他代扣', 36),
      moneyCol('loanDeduct', '借款扣回', 36),
      moneyCol('net', '实发合计', 45),
    ]
    const tableEnd = this.drawTable(doc, LM, y, columns, items, {
      maxBottom: doc.page.height - 60,
      fontSize: 6.3,
      rowHeight: 14.5,
      theme: 'payroll',
    })

    // 合计行：明细逐列汇总 + 主表合计字段校准
    const sumOf = (key: string) =>
      items.reduce((acc, it) => acc + Number((it as any)[key] ?? 0), 0)
    const totalRow: Record<string, number> = {
      baseSalary: sumOf('baseSalary'),
      performance: sumOf('performance'),
      allowance: sumOf('allowance'),
      overtime: sumOf('overtime'),
      gross: payroll.totalGross,
      insurancePersonal: payroll.totalInsurance,
      fundPersonal: payroll.totalFund,
      tax: payroll.totalTax,
      otherDeduct: payroll.totalOtherDeduct,
      loanDeduct: payroll.totalLoanDeduct,
      net: payroll.totalNet,
    }

    let y2 = tableEnd
    const rowH = 16
    if (y2 + rowH > doc.page.height - 52) {
      doc.addPage()
      y2 = 48
      this.drawTable(doc, LM, y2, columns, [], {
        maxBottom: y2,
        headerOnly: true,
        fontSize: 6.3,
        rowHeight: 14.5,
        theme: 'payroll',
      })
      y2 += 17
    }
    doc.font(this.fontBold).fontSize(6.3)
    doc.moveTo(LM, y2).lineTo(LM + W, y2).lineWidth(0.9).stroke()
    doc.moveTo(LM, y2 + rowH).lineTo(LM + W, y2 + rowH).lineWidth(0.9).stroke()
    const labelW = columns[0].width + columns[1].width + columns[2].width
    doc.text('合　计', LM, y2 + (rowH - 6.3 * 1.15) / 2, { width: labelW, align: 'center', lineBreak: false })
    let tx = LM + labelW
    for (let i = 3; i < columns.length; i++) {
      const col = columns[i]
      doc.moveTo(tx, y2).lineTo(tx, y2 + rowH).lineWidth(0.5).stroke()
      if (col.key) {
        doc.text(fmtMoney(totalRow[col.key]), tx, y2 + (rowH - 6.3 * 1.15) / 2, {
          width: col.width - 4,
          align: 'right',
          lineBreak: false,
        })
      }
      tx += col.width
    }
    doc.moveTo(tx, y2).lineTo(tx, y2 + rowH).lineWidth(0.5).stroke()
    y = y2 + rowH + 12

    // 大写合计
    doc.font(this.fontBold).fontSize(7.5)
    doc.text(
      `实发工资合计（大写）：人民币 ${amountInWords(payroll.totalNet)}　（小写 ￥ ${fmtMoney(payroll.totalNet)}）`,
      LM,
      y,
      { width: W, lineBreak: false },
    )
    y += 20

    this.drawSignRow(doc, LM, y, W, ['制表人', '审核人', '批准人'], 7.5)
    y += 26
    doc.font(this.fontRegular).fontSize(6).fillColor(COLOR_MUTED)
    doc.text(
      '说明：本表经批准后随工资发放，员工对金额有异议请于 3 个工作日内向财务部提出；借款扣回用于冲抵员工未还清借款。',
      LM,
      y,
      { width: W, lineBreak: false },
    )
    doc.fillColor('#000000')

    return this.collect(doc)
  }

  // ==================== 绘制工具 ====================

  /**
   * 顶部抬头：左上角主题色圆形色章（硬币大小，直径 28pt，白字单字「报/借/薪」），
   * 配黑色大标题居中、右上灰色单号、标题下公司名与主题色细分隔线。
   * 用一个小色章代替整条色带，省墨且仍能一眼区分单据类型。
   * @returns 抬头底部 y（正文起始位置）
   */
  private drawHeader(
    doc: PDFKit.PDFDocument,
    theme: ThemeKey,
    companyName: string,
    title: string,
    docNo?: string,
  ): number {
    const t = THEMES[theme]
    const icon = BADGE_ICON[theme]
    const pageW = doc.page.width
    const contentW = pageW - LM * 2
    const y0 = 26
    const d = 28 // 圆形色章直径
    const r = d / 2

    // 圆形色章（唯一的实色块，面积约 616pt²，仅为原色带的 2%）
    doc.save()
    doc.circle(LM + r, y0 + r, r).fill(t.main)
    doc.restore()
    doc.font(this.fontBold).fontSize(14).fillColor('#FFFFFF')
    doc.text(icon, LM, y0 + (d - 14 * 1.15) / 2, { width: d, align: 'center', lineBreak: false })
    doc.fillColor('#000000')

    // 标题（居中，黑色大字）
    doc.font(this.fontBold).fontSize(15).fillColor('#1A1A1A')
    doc.text(title, LM, y0 + (d - 15 * 1.15) / 2, { width: contentW, align: 'center', lineBreak: false })
    doc.fillColor('#000000')

    // 单号（右上灰色小字）
    if (docNo) {
      doc.font(this.fontRegular).fontSize(7.5).fillColor(COLOR_MUTED)
      doc.text(`No. ${docNo}`, pageW - LM - 150, y0 + (d - 7.5 * 1.15) / 2, {
        width: 150,
        align: 'right',
        lineBreak: false,
      })
      doc.fillColor('#000000')
    }

    let yy = y0 + d + 1
    if (companyName) {
      doc.font(this.fontRegular).fontSize(8.5).fillColor('#444444')
      doc.text(companyName, LM, yy, { width: contentW, align: 'center', lineBreak: false })
      doc.fillColor('#000000')
      yy += 12
    }
    // 主题色细分隔线（单线，低墨量）
    doc.save()
    doc.moveTo(LM, yy + 2).lineTo(pageW - LM, yy + 2).lineWidth(0.8).strokeColor(t.main).stroke()
    doc.restore()
    return yy + 8
  }

  /**
   * 金额强调条：浅色底 + 左侧大写金额 + 右侧主题色小写金额加粗。
   * @returns 条底部 y
   */
  private drawAmountBar(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    totalWidth: number,
    theme: ThemeKey,
    wordsText: string,
    amountText: string,
    amountFontSize = 11.5,
  ): number {
    const t = THEMES[theme]
    const h = 24
    doc.save()
    doc.rect(x, y, totalWidth, h).fill(t.light)
    doc.restore()
    doc.font(this.fontBold).fontSize(8.5)
    doc.text(wordsText, x + 8, y + (h - 8.5 * 1.15) / 2, {
      width: totalWidth - 130,
      lineBreak: false,
      ellipsis: true,
    })
    doc.fillColor(t.main).fontSize(amountFontSize)
    doc.text(`￥ ${amountText}`, x + totalWidth - 122, y + (h - amountFontSize * 1.15) / 2, {
      width: 114,
      align: 'right',
      lineBreak: false,
    })
    doc.fillColor('#000000')
    return y + h
  }

  /** 创建文档：每页绘制外边框 */
  private createDoc(size: 'A4' | number[]): PDFKit.PDFDocument {
    const doc = new PDFDocument({ size, margins: { top: 48, bottom: 48, left: LM, right: LM }, bufferPages: true })
    const decorate = () => {
      const page = doc.page
      doc.save()
      doc.rect(14, 14, page.width - 28, page.height - 28).lineWidth(1).stroke()
      doc.restore()
    }
    doc.on('pageAdded', decorate)
    // 首页在构造时已创建（早于监听注册），手动补画边框
    decorate()
    return doc
  }

  /** 信息栏（label：value 网格），返回结束 y。label 灰色、value 黑色加粗，层次分明 */
  private drawInfoGrid(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    totalWidth: number,
    pairs: Array<[string, string]>,
    columns: number,
    labelOffset = 78,
    fontSize = 9.5,
  ): number {
    const colW = totalWidth / columns
    const rowH = 20
    pairs.forEach(([label, value], idx) => {
      const row = Math.floor(idx / columns)
      const col = idx % columns
      const px = x + col * colW
      const py = y + row * rowH
      const padded = label.length < 4 ? label + '　'.repeat(4 - label.length) : label
      doc.font(this.fontRegular).fontSize(fontSize).fillColor(COLOR_MUTED)
      doc.text(`${padded}：`, px, py, { lineBreak: false })
      doc.font(this.fontBold).fillColor('#000000')
      doc.text(value ?? '—', px + labelOffset, py, { width: colW - labelOffset - 4, lineBreak: false })
    })
    return y + Math.ceil(pairs.length / columns) * rowH
  }

  /**
   * 明细表格（支持跨页，自动重画表头），返回结束 y。
   * 传 theme 时：表头浅色底 + 主题色文字、隔行底纹，提升可读性。
   */
  private drawTable(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    columns: PdfColumn[],
    rows: any[],
    opts: { maxBottom: number; fontSize?: number; rowHeight?: number; headerOnly?: boolean; theme?: ThemeKey },
  ): number {
    const fontSize = opts.fontSize ?? 9.5
    const rowH = opts.rowHeight ?? 24
    const headerH = rowH + 2
    const totalW = columns.reduce((acc, c) => acc + c.width, 0)
    const top = y
    let cy = y
    const theme = opts.theme ? THEMES[opts.theme] : null

    const drawHeader = () => {
      doc.font(this.fontBold).fontSize(fontSize)
      if (theme) {
        doc.save()
        doc.rect(x, cy, totalW, headerH).fill(theme.light)
        doc.restore()
        doc.fillColor(theme.main)
      }
      let hx = x
      doc.rect(x, cy, totalW, headerH).lineWidth(0.9).stroke()
      for (const col of columns) {
        doc.moveTo(hx, cy).lineTo(hx, cy + headerH).lineWidth(0.5).stroke()
        doc.text(col.label, hx, cy + (headerH - fontSize * 1.15) / 2, {
          width: col.width,
          align: 'center',
          lineBreak: false,
        })
        hx += col.width
      }
      doc.moveTo(hx, cy).lineTo(hx, cy + headerH).lineWidth(0.5).stroke()
      if (theme) doc.fillColor('#000000')
      cy += headerH
    }

    drawHeader()

    if (opts.headerOnly) return cy

    rows.forEach((row, ri) => {
      if (cy + rowH > opts.maxBottom) {
        doc.addPage()
        cy = 52
        drawHeader()
      }
      // 隔行底纹（奇数行浅灰）
      if (theme && ri % 2 === 1) {
        doc.save()
        doc.rect(x, cy, totalW, rowH).fill('#F6F8F9')
        doc.restore()
      }
      doc.font(this.fontRegular).fontSize(fontSize)
      let cx = x
      doc.moveTo(x, cy).lineTo(x + totalW, cy).lineWidth(0.5).stroke()
      for (const col of columns) {
        doc.moveTo(cx, cy).lineTo(cx, cy + rowH).lineWidth(0.5).stroke()
        const raw = col.text ? col.text(row, ri) : String(row?.[col.key ?? ''] ?? '')
        doc.text(raw, cx + 4, cy + (rowH - fontSize * 1.15) / 2, {
          width: col.width - 8,
          align: col.align ?? 'left',
          lineBreak: false,
          ellipsis: true,
          height: rowH,
        })
        cx += col.width
      }
      doc.moveTo(cx, cy).lineTo(cx, cy + rowH).lineWidth(0.5).stroke()
      cy += rowH
    })

    // 表底边线
    doc.moveTo(x, cy).lineTo(x + totalW, cy).lineWidth(0.9).stroke()
    void top
    return cy
  }

  /** 签字栏：浅灰分隔线 + 角色名（灰）+ 签署线，一行均分 */
  private drawSignRow(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    totalWidth: number,
    roles: string[],
    fontSize = 9.5,
  ) {
    const gap = totalWidth / roles.length
    doc.save()
    doc.moveTo(x, y - 8).lineTo(x + totalWidth, y - 8).lineWidth(0.6).strokeColor('#C4C9CF').stroke()
    doc.restore()
    doc.font(this.fontRegular).fontSize(fontSize)
    roles.forEach((role, i) => {
      const sx = x + i * gap
      const label = `${role}：`
      doc.fillColor(COLOR_MUTED)
      doc.text(label, sx, y, { lineBreak: false })
      doc.fillColor('#000000')
      const lineStart = sx + doc.widthOfString(label) + 4
      const lineEnd = sx + gap - 12
      doc.moveTo(lineStart, y + 14).lineTo(Math.max(lineEnd, lineStart + 30), y + 14).lineWidth(0.7).stroke()
    })
  }

  /** 收集 PDF 输出为 Buffer */
  private collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      doc.on('data', (c: Buffer) => chunks.push(c))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)
      doc.end()
    })
  }
}
