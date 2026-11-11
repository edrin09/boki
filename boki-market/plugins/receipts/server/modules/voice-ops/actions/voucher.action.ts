import { BadRequestException, Injectable } from '@nestjs/common'
import { In } from 'typeorm'
import { InjectCompanyRepo } from '@core/common/company/company-repo.decorator'
import type { CompanyScopedRepository } from '@core/common/company/company.repository'
import { Voucher } from '@core/entities/voucher.entity'
import { VoucherEntry } from '@core/entities/voucher-entry.entity'
import { Account } from '@core/entities/account.entity'
import { VoucherStatus } from '@core/common/enums'
import { VouchersService } from '@core/modules/vouchers/vouchers.service'
import { CatalogService } from '../bridge/catalog.service'
import type {
  ActionAdapter,
  ActionContext,
  ActionManifest,
  Preview,
  PreviewLine,
  PreviewMissing,
  PreviewOption,
} from '../bridge/protocol'
import {
  balanced,
  field,
  flag,
  HIGH_AMOUNT,
  line,
  money,
  round2,
  text,
  todayString,
} from './action.util'

const MAX_APPROVE_BATCH = 20

/** 货币资金科目：付款场景的贷方主角 */
const CASH_NAMES = new Set(['库存现金', '银行存款', '其他货币资金'])

function isCashAccount(account: Account): boolean {
  if (CASH_NAMES.has(account.name)) return true
  return ['1001', '1002', '1012'].includes(String(account.code ?? '').slice(0, 4))
}

/** 成本 / 费用类：5001 生产成本、6401/6402 营业成本、6601~6603 三项费用（收入类不算） */
function isCostOrExpense(account: Account): boolean {
  const code = String(account.code ?? '').slice(0, 4)
  return code.startsWith('5') || ['6401', '6402', '6601', '6602', '6603'].includes(code)
}

/** 收入类：6051 其他业务收入、6001 营业收入…正常余额在贷方 */
function isRevenueAccount(account: Account): boolean {
  const code = String(account.code ?? '').slice(0, 4)
  return code.startsWith('60') || /收入$/.test(String(account.name ?? ''))
}

/**
 * 原话给的科目写法是否已经明确指向该科目。
 * 用来决定「按 XX 处理」这类提示要不要出现：用户写对了就不该提示，
 * 写错（如 6601其他业务收入）就必须提示，否则账错了也看不出来。
 */
function sameAccount(raw: string, account: Account): boolean {
  const value = String(raw ?? '').replace(/\s/g, '')
  if (!value) return false
  const compact = `${account.code}${account.name}`.replace(/\s/g, '')
  return value === compact || value === String(account.code) || value === String(account.name)
}

/** 一份解析结论：preview 用它渲染卡片，commit 用它写库，杜绝两处各算一遍 */
interface VoucherPlan {
  amount: number
  date: string
  debit: Account | null
  credit: Account | null
  partnerId?: string
  departmentId?: string
  employeeId?: string
}

/**
 * 凭证类动作的共享能力：科目辅助核算、凭证号解析、凭证定位。
 *
 * 用组合而不是继承：Nest 的构造器依赖元数据在继承链上容易踩坑，
 * 显式注入更清楚，也便于单独测试。
 */
@Injectable()
export class VoucherSupport {
  constructor(
    readonly vouchers: VouchersService,
    readonly catalog: CatalogService,
    @InjectCompanyRepo(Voucher) readonly voucherRepo: CompanyScopedRepository<Voucher>,
    @InjectCompanyRepo(VoucherEntry) readonly entryRepo: CompanyScopedRepository<VoucherEntry>,
  ) {}

  /** 科目辅助核算要求（partner/department/project/employee） */
  auxOf(account: Account | null): string[] {
    return ((account?.auxiliaryTypes ?? []) as unknown as string[]) ?? []
  }

  accountLabel(account: Account): string {
    return `${account.code} ${account.name}`
  }

  /** 解析凭证号：支持「记-0012」「记12」「0012」 */
  parseVoucherNo(raw: string): { word?: string; no: number } | null {
    const value = text(raw).replace(/\s/g, '')
    if (!value) return null
    const match = value.match(/^([\u4e00-\u9fa5]{1,3})?[-－#号]?(\d{1,6})$/)
    if (!match) return null
    return { word: match[1] || undefined, no: Number(match[2]) }
  }

  /** 按凭证号 + 期间定位凭证（期间缺省时取最近一期） */
  async findVoucher(
    rawNo: string,
    period?: number,
  ): Promise<{ voucher: Voucher; entries: VoucherEntry[] } | null> {
    const parsed = this.parseVoucherNo(rawNo)
    if (!parsed) return null
    const where: Record<string, unknown> = { voucherNo: parsed.no }
    if (parsed.word) where.word = parsed.word
    if (period) where.period = period

    const voucher = (await this.voucherRepo.findOne({
      where: where as any,
      order: { period: 'DESC', createdAt: 'DESC' } as any,
    })) as Voucher | null
    if (!voucher) return null
    const entries = (await this.entryRepo.find({
      where: { voucherId: voucher.id } as any,
      order: { createdAt: 'ASC' } as any,
    })) as VoucherEntry[]
    return { voucher, entries }
  }

  statusLabel(status: string): string {
    if (status === VoucherStatus.APPROVED) return '已审核'
    if (status === VoucherStatus.CANCELLED) return '已作废'
    return '草稿'
  }

  formatNo(voucher: Voucher): string {
    return `${voucher.word}-${String(voucher.voucherNo).padStart(4, '0')}`
  }
}

/**
 * 一句话记账。
 *
 * 只生成**草稿**凭证：科目映射、辅助核算、借贷方向全在这里决定，
 * 模型只负责听懂「多少钱、什么科目、对方是谁」。
 */
@Injectable()
export class VoucherCreateAction implements ActionAdapter {
  readonly manifest: ActionManifest = {
    id: 'voucher.create',
    title: '一句话记账',
    description: '按口语生成一张记账凭证（草稿），需要金额、借方科目、贷方科目',
    params: {
      summary: { type: 'string', label: '摘要', editable: true, description: '如「购买电脑」「收到货款」' },
      amount: { type: 'number', label: '金额', required: true, editable: true, min: 0.01 },
      debitAccount: {
        type: 'string',
        label: '借方科目',
        required: true,
        editable: true,
        resolve: 'account',
        description: '填科目名称或编码，如「应收账款」「1122」',
      },
      creditAccount: {
        type: 'string',
        label: '贷方科目',
        required: true,
        editable: true,
        resolve: 'account',
        description: '填科目名称或编码，如「主营业务收入」「6001」',
      },
      date: { type: 'date', label: '凭证日期', editable: true, default: 'today' },
      partnerName: { type: 'string', label: '往来单位', editable: true, resolve: 'partner' },
      departmentName: { type: 'string', label: '部门', editable: true, resolve: 'department' },
      employeeName: { type: 'string', label: '员工', editable: true, resolve: 'employee' },
      remark: { type: 'string', label: '备注', editable: true },
    },
    examples: [
      '记一笔 8000 应收，客户某某公司，还没开票',
      '今天收到客户回款 12000，工行到账',
      '买了台电脑 6000，从工行付的',
    ],
    permission: 'voucher:create',
    amountField: 'amount',
  }

  constructor(private readonly support: VoucherSupport) {}

  async preview(args: Record<string, unknown>, ctx: ActionContext): Promise<Preview> {
    return (await this.build(args, ctx.text)).preview
  }

  async commit(args: Record<string, unknown>, ctx: ActionContext): Promise<Record<string, unknown>> {
    const { auxOf } = this.support
    // 与 preview 共用同一份解析结论：卡片上看到的科目，就是最终写进账里的科目
    const { preview, plan } = await this.build(args, ctx.text)
    if (preview.missing.length) {
      throw new BadRequestException(`还缺：${preview.missing.map((m) => m.label).join('、')}`)
    }
    if (!plan.debit || !plan.credit || !balanced(preview.lines)) {
      throw new BadRequestException('借贷不平衡，已中止入账')
    }

    const summary = text(args.summary)
    const entries = [plan.debit, plan.credit].map((account, index) => ({
      summary,
      accountId: account.id,
      debit: index === 0 ? plan.amount : 0,
      credit: index === 1 ? plan.amount : 0,
      partnerId: auxOf(account).includes('partner') ? plan.partnerId : undefined,
      departmentId: auxOf(account).includes('department') ? plan.departmentId : undefined,
      employeeId: auxOf(account).includes('employee') ? plan.employeeId : undefined,
    }))

    const saved = await this.support.vouchers.create(
      {
        word: '记',
        voucherDate: plan.date,
        entries: entries as any,
        remark: text(args.remark) || undefined,
      },
      ctx.operator,
      /** 方案 §11.5：财务默认只落草稿，人工在凭证页复核后审核 */
      false,
    )

    return {
      voucherId: saved.id,
      voucherNo: `${saved.word}-${String(saved.voucherNo).padStart(4, '0')}`,
      status: saved.status,
      period: saved.period,
      amount: money(plan.amount),
      /** 前端据此渲染「查看草稿」跳转，路由由适配器给出，面板不硬编码页面 */
      route: `/voucher/list?status=draft&period=${saved.period}`,
      routeText: '查看草稿凭证',
      message: '已生成草稿凭证，请到「凭证列表」复核后审核',
    }
  }

  /**
   * preview 与 commit 共用同一套推断，保证「看到的」=「写进去的」。
   *
   * 借方科目缺失时不再干等用户输入：按贷方科目 + 原话线索推荐一条并预填，
   * 同时在 warnings 里写明「按推荐填写」，用户可随时改选（仍是草稿）。
   */
  private async build(
    args: Record<string, unknown>,
    userText: string,
  ): Promise<{ preview: Preview; plan: VoucherPlan }> {
    const { catalog, auxOf, accountLabel } = this.support
    const missing: PreviewMissing[] = []
    const warnings: string[] = []
    const amount = round2(args.amount)
    const date = text(args.date) || todayString()

    if (!amount || amount <= 0) flag(missing, 'amount', '金额')

    const debitRaw = text(args.debitAccount)
    const creditRaw = text(args.creditAccount)
    // 用 resolveAccount 而不是「先截编码再匹配」：模型常写「6601其他业务收入」，
    // 这种编码是估的、名称才是本意，按编码取会静默记错科目。
    const debit = debitRaw ? await catalog.resolveAccount(debitRaw) : { hit: null, others: [] }
    const credit = creditRaw ? await catalog.resolveAccount(creditRaw) : { hit: null, others: [] }

    if (!debitRaw) flag(missing, 'debitAccount', '借方科目', 'account')
    else if (!debit.hit) {
      flag(missing, 'debitAccount', '借方科目', 'account')
      warnings.push(`没找到科目「${debitRaw}」，可从下拉里改选`)
    } else if (!sameAccount(debitRaw, debit.hit)) {
      warnings.push(`借方科目按「${accountLabel(debit.hit)}」处理，如有偏差请修改`)
    }

    if (!creditRaw) flag(missing, 'creditAccount', '贷方科目', 'account')
    else if (!credit.hit) {
      flag(missing, 'creditAccount', '贷方科目', 'account')
      warnings.push(`没找到科目「${creditRaw}」，可从下拉里改选`)
    } else if (!sameAccount(creditRaw, credit.hit)) {
      warnings.push(`贷方科目按「${accountLabel(credit.hit)}」处理，如有偏差请修改`)
    }

    // 借方推荐：贷方先定性，再由原话线索选借方。只有贷方认出来了才敢预填，
    // 否则整笔业务方向都还没定，预填等于瞎猜。
    // 推荐列表始终计算（不只在借方为空时），否则用户改过一次以后下拉里就再也没有推荐项了。
    let debitAccount = debit.hit
    let creditAccount = credit.hit
    let debitSuggest = await catalog.suggestDebit(creditAccount, userText)
    if (!debitAccount && creditAccount && debitSuggest.length) {
      debitAccount = debitSuggest[0].account
      const drop = missing.findIndex((item) => item.field === 'debitAccount')
      if (drop >= 0) missing.splice(drop, 1)
      warnings.push(
        `借方科目按推荐填为「${accountLabel(debitAccount)}」（${debitSuggest[0].hint}），不对请直接改选`,
      )
    }

    /**
     * 方向纠偏：收入科目落在借方、货币资金落在贷方。
     * 「借 营业收入 / 贷 银行存款」不是任何真实业务的写法（收入类正常在贷方），
     * 小模型却经常这么输出，用户看到的就是「收入 6000，借方是销售费用」。
     * 这种组合可以直接判定为写反，对调后继续走预演，并在卡片上说明。
     */
    if (debitAccount && creditAccount && isRevenueAccount(debitAccount) && isCashAccount(creditAccount)) {
      const cash = creditAccount
      creditAccount = debitAccount
      debitAccount = cash
      // 换边后原来的推荐（按「付款」推的费用）已经没意义，按收入重算
      debitSuggest = await catalog.suggestDebit(creditAccount, userText)
      warnings.push(
        `借贷方向已按「借 ${debitAccount.name} / 贷 ${creditAccount.name}」纠正：收入科目应记贷方，不对请直接改选科目`,
      )
    }

    // 辅助核算：科目要求往来单位/部门/员工时必须给出，否则内核会拒绝记账
    const needPartner = auxOf(debitAccount).includes('partner') || auxOf(creditAccount).includes('partner')
    const needDept = auxOf(debitAccount).includes('department') || auxOf(creditAccount).includes('department')
    const needEmployee = auxOf(debitAccount).includes('employee') || auxOf(creditAccount).includes('employee')

    const employeeName = text(args.employeeName)
    const deptName = text(args.departmentName)
    /** 模型漏掉「对方是 XX」时，用档案反查原话兜底 */
    let partnerName = text(args.partnerName)
    let partnerGuessed = false
    if (!partnerName) {
      const guess = await catalog.guessPartner(userText)
      if (guess) {
        partnerName = guess.name
        partnerGuessed = true
      }
    }

    let partnerId: string | undefined
    let partnerLabel = ''
    if (partnerName) {
      const partner = await catalog.matchPartner(partnerName)
      if (partner.hit) {
        partnerId = partner.hit.id
        partnerLabel = partner.hit.name
        if (partnerGuessed) {
          warnings.push(`往来单位按原话匹配为「${partner.hit.name}」，不对请直接改选`)
        } else if (partner.hit.name !== partnerName) {
          warnings.push(`往来单位按「${partner.hit.name}」处理`)
        }
      } else {
        flag(missing, 'partnerName', '往来单位', 'partner')
        warnings.push(
          `往来单位「${partnerName}」不在档案里，请先在「基础资料 → 往来单位」新增，或改成已有名称`,
        )
      }
    } else if (needPartner) {
      flag(missing, 'partnerName', '往来单位', 'partner')
      warnings.push('所选科目需要往来单位辅助核算，请补一个客户/供应商')
    }

    let departmentId: string | undefined
    let deptLabel = ''
    if (deptName) {
      const dept = await catalog.matchDepartment(deptName)
      if (dept.hit) {
        departmentId = dept.hit.id
        deptLabel = dept.hit.name
        if (dept.hit.name !== deptName) warnings.push(`部门按「${dept.hit.name}」处理`)
      } else if (needDept) {
        flag(missing, 'departmentName', '部门', 'department')
        warnings.push(`部门「${deptName}」不在档案里，请先新增部门`)
      }
    } else if (needDept) {
      flag(missing, 'departmentName', '部门', 'department')
      warnings.push('所选科目需要部门辅助核算，请补一个部门')
    }

    let employeeId: string | undefined
    let employeeLabel = ''
    if (employeeName) {
      const employee = await catalog.matchEmployee(employeeName)
      if (employee.hit) {
        employeeId = employee.hit.id
        employeeLabel = employee.hit.name
      } else if (needEmployee) {
        flag(missing, 'employeeName', '员工', 'employee')
        warnings.push(`员工「${employeeName}」不在档案里`)
      }
    } else if (needEmployee) {
      flag(missing, 'employeeName', '员工', 'employee')
    }

    const lines: PreviewLine[] = []
    if (amount > 0) {
      // 辅助核算逐科目判断：只有声明了对应辅助类型的科目才挂载，
      // 否则收入类科目会被错误地显示成「客户：xxx」。
      const auxFor = (account: Account | null): string => {
        if (!account) return ''
        const types = auxOf(account)
        const parts: string[] = []
        if (types.includes('partner') && partnerLabel) parts.push(`客户：${partnerLabel}`)
        if (types.includes('department') && deptLabel) parts.push(`部门：${deptLabel}`)
        return parts.join(' / ')
      }
      if (debitAccount) lines.push(line(accountLabel(debitAccount), amount, 0, auxFor(debitAccount)))
      if (creditAccount) lines.push(line(accountLabel(creditAccount), 0, amount, auxFor(creditAccount)))
    }

    // 客户选了但两个科目都不带往来单位辅助核算 → 入账时会被静默丢掉，
    // 用户看到的是「明明填了客户，凭证上却没有」，必须先说清楚。
    if (partnerId && !needPartner) {
      warnings.push(
        `往来单位「${partnerLabel}」不会写进这张凭证：所选科目都没启用往来单位辅助核算`,
      )
    }

    if (amount >= HIGH_AMOUNT) {
      warnings.push(`金额较大（${money(amount)} 元），请再核对一次原始单据`)
    }

    // 方向体检：付款场景小模型常把货币资金写到借方、费用写到贷方。
    // 只提示不自动翻，借方/贷方都是可编辑字段，用户改完会重新预演。
    if (debitAccount && creditAccount && isCashAccount(debitAccount) && isCostOrExpense(creditAccount)) {
      warnings.push(
        `借贷方向可能反了：${debitAccount.name} 在借方、${creditAccount.name} 在贷方。` +
          '一般付款应「借 费用/成本、贷 银行存款（库存现金）」，请核对后再确认',
      )
    }

    const accountField = (
      key: string,
      label: string,
      account: Account | null,
      raw: string,
      options: PreviewOption[] = [],
    ) =>
      field(key, label, account ? accountLabel(account) : raw, true, {
        kind: 'account',
        placeholder: '从科目表选择',
        options,
      })

    return {
      preview: {
        title: `记账凭证 · ${text(args.summary) || '一句话记账'}`,
        summary:
          debitAccount && creditAccount
            ? `借 ${debitAccount.name} ${money(amount)} / 贷 ${creditAccount.name} ${money(amount)}`
            : '等待补全科目后生成分录',
        fields: [
          field('date', '凭证日期', date, true, { kind: 'date' }),
          field('summary', '摘要', text(args.summary)),
          field('amount', '金额', amount ? money(amount) : '', true, { kind: 'amount' }),
          accountField(
            'debitAccount',
            '借方科目',
            debitAccount,
            debitRaw,
            debitSuggest.map((item) => ({
              value: accountLabel(item.account),
              label: accountLabel(item.account),
              hint: item.hint,
            })),
          ),
          accountField('creditAccount', '贷方科目', creditAccount, creditRaw),
          field('partnerName', '往来单位', partnerLabel || partnerName, true, {
            kind: 'partner',
            placeholder: '从往来单位里选择',
          }),
          field('departmentName', '部门', deptLabel || deptName, true, {
            kind: 'department',
            placeholder: '从部门里选择',
          }),
          ...(needEmployee || employeeName
            ? [
                field('employeeName', '员工', employeeLabel || employeeName, true, {
                  kind: 'employee' as const,
                  placeholder: '从员工里选择',
                }),
              ]
            : []),
          field('remark', '备注', text(args.remark)),
        ],
        lines,
        missing,
        warnings,
        items: [],
      },
      plan: {
        amount,
        date,
        debit: debitAccount,
        credit: creditAccount,
        partnerId,
        departmentId,
        employeeId,
      },
    }
  }
}

/**
 * 一句话改凭证。
 *
 * 只处理两边分录的常见场景（改摘要/金额/日期/科目）。
 * 多分录凭证一律要求去凭证页改——比在这里猜怎么分摊安全。
 */
@Injectable()
export class VoucherModifyAction implements ActionAdapter {
  readonly manifest: ActionManifest = {
    id: 'voucher.modify',
    title: '修改凭证',
    description: '按凭证号找到草稿凭证，替换摘要、金额、日期或科目',
    params: {
      voucherNo: {
        type: 'string',
        label: '凭证号',
        required: true,
        editable: true,
        resolve: 'voucher',
        description: '如「记-0012」',
      },
      period: { type: 'number', label: '会计期间', editable: false, description: 'YYYYMM，可选' },
      newSummary: { type: 'string', label: '新摘要', editable: true },
      newAmount: { type: 'number', label: '新金额', editable: true, min: 0.01 },
      newDate: { type: 'date', label: '新日期', editable: true },
      newDebitAccount: { type: 'string', label: '新借方科目', editable: true, resolve: 'account' },
      newCreditAccount: { type: 'string', label: '新贷方科目', editable: true, resolve: 'account' },
    },
    examples: ['把记-0012 的摘要改成差旅费', '记-12 金额记错了，应该是 1200'],
    permission: 'voucher:update',
    amountField: 'newAmount',
  }

  constructor(private readonly support: VoucherSupport) {}

  async preview(args: Record<string, unknown>, ctx: ActionContext): Promise<Preview> {
    void ctx
    return this.build(args)
  }

  async commit(args: Record<string, unknown>, ctx: ActionContext): Promise<Record<string, unknown>> {
    const { catalog } = this.support
    const preview = await this.build(args)
    if (preview.missing.length) {
      throw new BadRequestException(`还缺：${preview.missing.map((m) => m.label).join('、')}`)
    }

    const period = args.period ? Number(args.period) : undefined
    const found = await this.support.findVoucher(text(args.voucherNo), period)
    if (!found) throw new BadRequestException('没找到这张凭证')
    if (found.voucher.status !== VoucherStatus.DRAFT) {
      throw new BadRequestException(
        `凭证 ${this.support.formatNo(found.voucher)} 当前是${this.support.statusLabel(found.voucher.status)}状态，请先反审核再修改`,
      )
    }
    if (found.entries.length !== 2) {
      throw new BadRequestException('多分录凭证请到「凭证列表」里改，这里只处理一借一贷')
    }

    const date = text(args.newDate) || found.voucher.voucherDate
    const summary = text(args.newSummary) || found.entries[0].summary
    const amount = args.newAmount !== undefined ? round2(args.newAmount) : undefined

    const debitEntry = found.entries.find((e) => Number(e.debit) > 0) ?? found.entries[0]
    const creditEntry = found.entries.find((e) => Number(e.credit) > 0) ?? found.entries[1]

    const debitAccount = text(args.newDebitAccount)
      ? (await catalog.resolveAccount(text(args.newDebitAccount))).hit
      : null
    const creditAccount = text(args.newCreditAccount)
      ? (await catalog.resolveAccount(text(args.newCreditAccount))).hit
      : null

    const debitId = debitAccount?.id ?? debitEntry.accountId
    const creditId = creditAccount?.id ?? creditEntry.accountId
    const debitAmount = amount ?? Number(debitEntry.debit)
    const creditAmount = amount ?? Number(creditEntry.credit)
    if (Math.round(debitAmount * 100) !== Math.round(creditAmount * 100)) {
      throw new BadRequestException('修改后借贷不平衡，已中止')
    }

    const saved = await this.support.vouchers.update(
      found.voucher.id,
      {
        word: found.voucher.word as string,
        voucherDate: date,
        entries: [
          {
            summary,
            accountId: debitId,
            debit: debitAmount,
            credit: 0,
            partnerId: debitEntry.partnerId || undefined,
            departmentId: debitEntry.departmentId || undefined,
            employeeId: debitEntry.employeeId || undefined,
          },
          {
            summary,
            accountId: creditId,
            debit: 0,
            credit: creditAmount,
            partnerId: creditEntry.partnerId || undefined,
            departmentId: creditEntry.departmentId || undefined,
            employeeId: creditEntry.employeeId || undefined,
          },
        ] as any,
        remark: found.voucher.remark ?? undefined,
      },
      ctx.operator,
      false,
    )

    return {
      voucherId: saved.id,
      voucherNo: `${saved.word}-${String(saved.voucherNo).padStart(4, '0')}`,
      status: saved.status,
      period: saved.period,
      route: `/voucher/list?status=draft&period=${saved.period}`,
      routeText: '查看草稿凭证',
      message: '凭证已修改（仍为草稿），复核后请审核',
    }
  }

  private async build(args: Record<string, unknown>): Promise<Preview> {
    const { statusLabel, formatNo } = this.support
    const missing: PreviewMissing[] = []
    const warnings: string[] = []
    const rawNo = text(args.voucherNo)
    if (!rawNo) flag(missing, 'voucherNo', '凭证号', 'voucher')

    const changes = [
      text(args.newSummary) && '摘要',
      args.newAmount !== undefined && args.newAmount !== null && `金额 ${money(args.newAmount)}`,
      text(args.newDate) && '日期',
      text(args.newDebitAccount) && '借方科目',
      text(args.newCreditAccount) && '贷方科目',
    ].filter(Boolean) as string[]

    if (!changes.length && rawNo) {
      warnings.push('没说清要改什么：可以改摘要、金额、日期或科目')
    }

    const period = args.period ? Number(args.period) : undefined
    const found = rawNo ? await this.support.findVoucher(rawNo, period) : null

    if (rawNo && !found) {
      flag(missing, 'voucherNo', '凭证号', 'voucher')
      warnings.push(`没找到凭证「${rawNo}」，请核对凭证号（可在凭证列表查看）`)
    }

    const lines = []
    if (found) {
      if (found.voucher.status !== VoucherStatus.DRAFT) {
        warnings.push(
          `这张凭证已${statusLabel(found.voucher.status)}，必须先在凭证列表反审核才能修改`,
        )
      }
      if (found.entries.length !== 2) {
        warnings.push('这张凭证是多分录凭证，请到「凭证列表」里修改')
      }
      for (const entry of found.entries) {
        lines.push(
          line(`${entry.accountCode} ${entry.accountName}`, Number(entry.debit), Number(entry.credit)),
        )
      }
    }

    return {
      title: found ? `修改凭证 · ${formatNo(found.voucher)}` : '修改凭证',
      summary: found
        ? `原：${found.entries[0]?.summary || '（无摘要）'} / 改：${changes.join('、') || '未说明'}`
        : '把凭证号补上才能改',
      fields: [
        field('voucherNo', '凭证号', found ? formatNo(found.voucher) : rawNo),
        field('voucherDate', '原日期', found?.voucher.voucherDate ?? '', false),
        field('newSummary', '新摘要', text(args.newSummary)),
        field(
          'newAmount',
          '新金额',
          args.newAmount !== undefined && args.newAmount !== null ? money(args.newAmount) : '',
          true,
          { kind: 'amount' },
        ),
        field('newDate', '新日期', text(args.newDate), true, { kind: 'date' }),
        field('newDebitAccount', '新借方科目', text(args.newDebitAccount), true, {
          kind: 'account',
          placeholder: '从科目表选择',
        }),
        field('newCreditAccount', '新贷方科目', text(args.newCreditAccount), true, {
          kind: 'account',
          placeholder: '从科目表选择',
        }),
      ],
      lines,
      missing,
      warnings,
      items: [],
    }
  }
}

/**
 * 一句话审核凭证。
 *
 * 这是唯一会推进凭证状态的动作，但推进的触发点始终是「用户点了确认」，
 * 不存在模型自动审核的路径（方案 §8 不做自动审核）。
 */
@Injectable()
export class VoucherApproveAction implements ActionAdapter {
  readonly manifest: ActionManifest = {
    id: 'voucher.approve',
    title: '审核凭证',
    description: '按凭证号或「期间 + 摘要关键词」找到草稿凭证，人工确认后审核',
    params: {
      voucherNo: { type: 'string', label: '凭证号', editable: false, resolve: 'voucher' },
      period: {
        type: 'number',
        label: '会计期间',
        editable: false,
        description: 'YYYYMM，不填则取全部未审核',
      },
      summaryKeyword: { type: 'string', label: '摘要关键词', editable: false, description: '如「差旅费」' },
    },
    examples: ['审核这个月所有差旅费凭证', '把记-0015 审了'],
    permission: 'voucher:approve',
    batch: true,
  }

  constructor(private readonly support: VoucherSupport) {}

  async preview(args: Record<string, unknown>, ctx: ActionContext): Promise<Preview> {
    void ctx
    const missing: PreviewMissing[] = []
    const warnings: string[] = []
    const rawNo = text(args.voucherNo)
    const period = args.period ? Number(args.period) : undefined
    const keyword = text(args.summaryKeyword)

    if (!rawNo && !keyword) {
      flag(missing, 'voucherNo', '凭证号或关键词', 'voucher')
      warnings.push('请说要审哪一张（记-0012），或者按关键词/期间批量审')
    }

    const targets = await this.collect(rawNo, period, keyword)
    if (!targets.length) {
      warnings.push(
        rawNo
          ? `凭证「${rawNo}」不存在或不是草稿状态，只有草稿凭证需要审核`
          : '没有符合条件的待审核草稿凭证',
      )
    }

    const items = targets.map((voucher) => ({
      id: voucher.id,
      no: this.support.formatNo(voucher),
      date: String(voucher.voucherDate),
      summary: String(voucher.remark ?? ''),
      amount: round2(voucher.debitTotal),
      status: this.support.statusLabel(voucher.status),
    }))

    const unbalanced = targets.filter(
      (voucher) =>
        Math.round(Number(voucher.debitTotal) * 100) !==
        Math.round(Number(voucher.creditTotal) * 100),
    )
    if (unbalanced.length) {
      warnings.push(`${unbalanced.length} 张凭证借贷不平，将被跳过`)
    }

    const total = items.reduce((sum, item) => sum + (item.amount ?? 0), 0)
    return {
      title: `审核凭证 · ${items.length} 张`,
      summary: items.length
        ? `将审核 ${items.length} 张草稿凭证，合计 ${money(total)}`
        : '没有待审核的凭证',
      fields: [
        field('voucherNo', '凭证号', rawNo || '（按条件批量）', false),
        field('period', '会计期间', period ? String(period) : '不限', false),
        field('summaryKeyword', '关键词', keyword, false),
      ],
      lines: [],
      missing,
      warnings,
      items,
    }
  }

  async commit(args: Record<string, unknown>, ctx: ActionContext): Promise<Record<string, unknown>> {
    const rawNo = text(args.voucherNo)
    const period = args.period ? Number(args.period) : undefined
    const keyword = text(args.summaryKeyword)
    if (!rawNo && !keyword) throw new BadRequestException('没说清要审哪张凭证')

    const targets = await this.collect(rawNo, period, keyword)
    if (!targets.length) throw new BadRequestException('没有符合条件的待审核凭证')

    const approved: string[] = []
    const skipped: Array<{ voucherNo: string; reason: string }> = []

    for (const voucher of targets) {
      try {
        await this.support.vouchers.approve(voucher.id, ctx.operator)
        approved.push(this.support.formatNo(voucher))
      } catch (err) {
        skipped.push({
          voucherNo: this.support.formatNo(voucher),
          reason: (err as Error).message,
        })
      }
    }

    const donePeriod = period ?? targets[0]?.period
    return {
      approved: approved.length,
      skipped: skipped.length,
      vouchers: approved,
      reasons: skipped,
      ...(donePeriod ? { period: donePeriod } : {}),
      route: `/voucher/list?status=approved${donePeriod ? `&period=${donePeriod}` : ''}`,
      routeText: '查看已审核凭证',
      message:
        approved.length > 0 ? `已审核 ${approved.length} 张凭证` : '没有凭证被审核，请查看原因',
    }
  }

  /** 收集待审草稿：凭证号优先，其次期间 + 摘要关键词 */
  private async collect(
    rawNo: string,
    period: number | undefined,
    keyword: string,
  ): Promise<Voucher[]> {
    if (rawNo) {
      const found = await this.support.findVoucher(rawNo, period)
      return found && found.voucher.status === VoucherStatus.DRAFT ? [found.voucher] : []
    }

    const where: Record<string, unknown> = { status: VoucherStatus.DRAFT }
    if (period) where.period = period
    const drafts = (await this.support.voucherRepo.find({
      where: where as any,
      order: { period: 'DESC', voucherNo: 'ASC' } as any,
      take: 200,
    })) as Voucher[]

    if (!keyword) return drafts.slice(0, MAX_APPROVE_BATCH)

    const entries = drafts.length
      ? ((await this.support.entryRepo.find({
          where: { voucherId: In(drafts.map((voucher) => voucher.id)) } as any,
        })) as VoucherEntry[])
      : []
    const matched = new Set(
      entries.filter((entry) => String(entry.summary ?? '').includes(keyword)).map((e) => e.voucherId),
    )
    return drafts.filter((voucher) => matched.has(voucher.id)).slice(0, MAX_APPROVE_BATCH)
  }
}
