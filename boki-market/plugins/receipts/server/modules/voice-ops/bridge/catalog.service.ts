import { Injectable } from '@nestjs/common'
import { InjectCompanyRepo } from '@core/common/company/company-repo.decorator'
import type { CompanyScopedRepository } from '@core/common/company/company.repository'
import { Account } from '@core/entities/account.entity'
import { Partner } from '@core/entities/partner.entity'
import { Employee } from '@core/entities/hr.entity'
import { Department } from '@core/entities/department.entity'
import { BankAccount } from '@core/entities/bank-account.entity'

/** 注入模型上下文的候选条目（小模型只吃 top-N，禁止全量灌入） */
export interface CatalogSnapshot {
  accounts: Array<{ code: string; name: string; direction: string; aux: string }>
  partners: string[]
  employees: string[]
  departments: string[]
  bankAccounts: string[]
}

/** 名称 → 档案的匹配结果 */
export interface MatchResult<T> {
  hit: T | null
  /** 其余相近候选（用于预览警告里提示） */
  others: T[]
}

/** 借方科目推荐项：候选 + 一句人话理由 */
export interface SuggestItem {
  account: Account
  hint: string
}

/**
 * 推荐规则：靠贷方科目定「这笔钱从哪来/到哪去」，再靠原话里的线索选对应借方。
 *
 * 这是会计常识，不是模型能猜的：模型只负责听懂「六千收入，对方广州光影空间，还没开票」，
 * 「未开票先挂应收」要在适配器侧决定。
 */
interface SuggestRule {
  /** 命中原话的线索；不写表示「兜底，永远命中」 */
  cue?: RegExp
  names: string[]
  hint: string
}

/** 贷方是收入类：借方通常是「钱收到了没」 */
const REVENUE_RULES: SuggestRule[] = [
  {
    cue: /(未开票|没开票|未开发票|没开发票|不开票|不开发票|未收款|没收到|没到账|未到账|挂账|挂应收|应收|欠着|月结|账期)/,
    names: ['应收账款', '其他应收款'],
    hint: '还没开票/收款，先挂应收',
  },
  {
    cue: /(收到|已收|到账|回款|打款|收款|转账|微信|支付宝|现金)/,
    names: ['银行存款', '库存现金'],
    hint: '款项已收到，记货币资金',
  },
  {
    names: ['应收账款', '银行存款', '库存现金'],
    hint: '收入类默认先挂应收，已收到钱请改银行存款',
  },
]

/** 贷方是货币资金（付款场景）：借方按付款用途选费用或资产 */
const PAY_RULES: SuggestRule[] = [
  {
    cue: /(工资|薪资|薪酬|社保|公积金|奖金)/,
    names: ['应付职工薪酬', '管理费用'],
    hint: '发工资先冲应付职工薪酬',
  },
  {
    cue: /(增值税|附加税|个税|所得税|税金|缴税|交税)/,
    names: ['应交税费'],
    hint: '缴税走应交税费',
  },
  {
    cue: /(房租|租金|水电|水费|电费|物业|办公|差旅|招待|快递|运费|广告|推广|话费|通讯|服务费)/,
    names: ['管理费用', '销售费用'],
    hint: '日常费用计入期间费用',
  },
  {
    cue: /(进货|采购|原材料|库存|商品|货款)/,
    names: ['库存商品', '原材料'],
    hint: '采购入库先记存货',
  },
  {
    cue: /(设备|电脑|打印机|服务器|车|装修|固定资产)/,
    names: ['固定资产'],
    hint: '购置资产记固定资产',
  },
  {
    cue: /(借款|还款|垫付|备用金|押金)/,
    names: ['其他应收款', '其他应付款'],
    hint: '往来款走其他应收/应付',
  },
  {
    names: ['管理费用', '销售费用', '营业成本', '库存商品', '固定资产'],
    hint: '按付款用途选费用或资产科目',
  },
]

/** 贷方是应付账款：冲负债，借方是入库/费用 */
const PAYABLE_RULES: SuggestRule[] = [
  { names: ['库存商品', '原材料', '管理费用', '销售费用'], hint: '冲应付账款，对应采购入库或费用' },
]

/** 兜底：贷方看不出类别时给最常见的三类 */
const DEFAULT_RULES: SuggestRule[] = [
  { names: ['应收账款', '银行存款', '管理费用'], hint: '按业务性质选择借方科目' },
]


const ACCOUNT_LIMIT = 40
const NAME_LIMIT = 15
const DEPT_LIMIT = 10
const BANK_LIMIT = 10

/**
 * 科目别名（口语/行业标准名 → 本系统科目名）。
 *
 * 这是业务知识，必须留在适配器侧而不是 prompt：模型可以按行业口径说
 * 「主营业务收入」，落账要归到本账套的「营业收入」。
 */
const ACCOUNT_ALIAS: Record<string, string> = {
  主营业务收入: '营业收入',
  主营收入: '营业收入',
  销售收入: '营业收入',
  营业收入: '营业收入',
  主营业务成本: '营业成本',
  销售成本: '营业成本',
  应交税金: '应交税费',
  应付工资: '应付职工薪酬',
  应付薪酬: '应付职工薪酬',
  工资: '应付职工薪酬',
  现金: '库存现金',
  工行: '银行存款',
  建行: '银行存款',
  农行: '银行存款',
  中行: '银行存款',
  招行: '银行存款',
  银行: '银行存款',
  存货: '库存商品',
  办公费: '管理费用',
  办公用品: '管理费用',
  差旅费: '管理费用',
  房租: '管理费用',
  租金: '管理费用',
  水电费: '管理费用',
  水费: '管理费用',
  电费: '管理费用',
  物业费: '管理费用',
  招待费: '管理费用',
  业务招待费: '管理费用',
  手续费: '财务费用',
  银行手续费: '财务费用',
  利息: '财务费用',
  利息支出: '财务费用',
  运费: '销售费用',
  快递费: '销售费用',
  广告费: '销售费用',
  推广费: '销售费用',
  营销费: '销售费用',
  税金: '应交税费',
  交税: '应交税费',
  增值税: '应交税费',
  个税: '应交税费',
  备用金: '其他应收款',
  押金: '其他应收款',
}

/**
 * 候选召回 + 名称解析。
 *
 * 两件事都在这里：
 * 1. `recall()`：按用户原话给模型挑 top-N 候选（方案 §5 的上下文控制）；
 * 2. `match*()`：把模型输出的名称解析成档案 ID（方案 §4 的适配器职责）。
 *
 * 只读，无副作用。
 */
@Injectable()
export class CatalogService {
  constructor(
    @InjectCompanyRepo(Account) private readonly accountRepo: CompanyScopedRepository<Account>,
    @InjectCompanyRepo(Partner) private readonly partnerRepo: CompanyScopedRepository<Partner>,
    @InjectCompanyRepo(Employee) private readonly employeeRepo: CompanyScopedRepository<Employee>,
    @InjectCompanyRepo(Department)
    private readonly departmentRepo: CompanyScopedRepository<Department>,
    @InjectCompanyRepo(BankAccount)
    private readonly bankRepo: CompanyScopedRepository<BankAccount>,
  ) {}

  // ==================== 候选召回 ====================

  async recall(text: string): Promise<CatalogSnapshot> {
    const [accounts, partners, employees, departments, banks] = await Promise.all([
      this.accountRepo.find({ where: { status: 1, isLeaf: true } as any }),
      this.partnerRepo.find({ where: { status: 1 } as any }),
      this.employeeRepo.find({ where: { status: 1 } as any }),
      this.departmentRepo.find(),
      this.bankRepo.find({ where: { status: 1 } as any }),
    ])

    const scored = (rows: any[], fields: string[], limit: number) =>
      rows
        .map((row) => ({
          row,
          score: scoreValues(text, fields.map((f) => String(row[f] ?? ''))),
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((item) => item.row)

    return {
      accounts: scored(accounts, ['name', 'code', 'fullName'], ACCOUNT_LIMIT).map((a) => ({
        code: a.code,
        name: a.name,
        direction: a.direction,
        aux: ((a.auxiliaryTypes ?? []) as string[]).join('/'),
      })),
      partners: scored(partners, ['name'], NAME_LIMIT).map((p) => p.name),
      employees: scored(employees, ['name'], NAME_LIMIT).map((e) => e.name),
      departments: scored(departments, ['name'], DEPT_LIMIT).map((d) => d.name),
      bankAccounts: scored(banks, ['name', 'accountCode'], BANK_LIMIT).map((b) => b.name),
    }
  }

  // ==================== 名称解析 ====================

  /** 会计科目：编码 → 名称 → 别名 → 全名 → 模糊；只返回明细科目 */
  async matchAccount(keyword: string): Promise<MatchResult<Account>> {
    const raw = String(keyword ?? '').trim()
    if (!raw) return { hit: null, others: [] }
    const all = await this.accountRepo.find({ where: { status: 1 } as any })

    const leafOf = (account: Account): Account | null => {
      if (account.isLeaf) return account
      const children = all
        .filter((a) => a.parentId === account.id && a.status === 1)
        .sort((x, y) => x.code.localeCompare(y.code))
      return children.find((c) => c.isLeaf) ?? null
    }

    const exactCode = all.find((a) => a.code === raw)
    if (exactCode) return { hit: leafOf(exactCode) ?? exactCode, others: [] }

    const exactName = all.filter((a) => a.name === raw)
    if (exactName.length) {
      return { hit: leafOf(exactName[0]) ?? exactName[0], others: exactName.slice(1) }
    }

    // 别名：模型按行业口径说「主营业务收入」，本账套里叫「营业收入」
    const alias = ACCOUNT_ALIAS[raw]
    if (alias) {
      const aliased = all.filter((a) => a.name === alias)
      if (aliased.length) {
        return { hit: leafOf(aliased[0]) ?? aliased[0], others: aliased.slice(1) }
      }
    }

    const contains = all
      .filter((a) => a.name.includes(raw) || a.fullName.includes(raw))
      .sort((x, y) => x.level - y.level)
    if (contains.length) {
      const best = leafOf(contains[0]) ?? contains[0]
      return { hit: best, others: contains.slice(1, 4) }
    }

    // 模糊兜底：命中字数必须过半，否则宁可返回空让用户挑，
    // 也不能把「主营业务收入」错配成「其他业务收入」写进账里
    const fuzzy = all
      .map((a) => ({ a, score: scoreValues(raw, [a.name, a.code]) }))
      .filter((item) => item.score > 0)
      .sort((x, y) => y.score - x.score)
    const top = fuzzy[0]
    if (!top) return { hit: null, others: [] }
    const grams = Math.max(top.a.name.length - 1, 1)
    if (top.score < 2 || top.score / grams < 0.5) {
      return { hit: null, others: fuzzy.slice(0, 3).map((item) => item.a) }
    }
    const best = leafOf(top.a) ?? top.a
    return { hit: best, others: fuzzy.slice(1, 4).map((item) => item.a) }
  }

  /**
   * 科目解析：编码与名称「打架」时以名称为准。
   *
   * 小模型经常写出「6601其他业务收入」这种编码是估的、名称才是本意的组合。
   * 直接按编码取会静默落到 6601 销售费用——账目错了但看不出错。
   * 所以这里拆开两边都查：指向同一科目就用编码结果，不一致时信名称。
   */
  async resolveAccount(keyword: string): Promise<MatchResult<Account>> {
    const raw = String(keyword ?? '').trim()
    if (!raw) return { hit: null, others: [] }
    const match = raw.match(/^(\d{3,6})(?=[^\d]|$)/)
    if (!match) return this.matchAccount(raw)

    const code = match[1]
    const rest = raw.slice(code.length).trim()
    const byCode = await this.matchAccount(code)
    if (!rest) return byCode

    const byName = await this.matchAccount(rest)
    if (!byName.hit) return byCode
    if (!byCode.hit) return byName
    if (byName.hit.id === byCode.hit.id) return byCode
    // 名称里已经包含了编码科目的名字 → 编码是对的，名称只是补全（如「1002 银行存款」）
    const agree = rest.includes(byCode.hit.name) || byCode.hit.name.includes(rest)
    return agree ? byCode : { hit: byName.hit, others: [byCode.hit, ...byName.others] }
  }

  /**
   * 借方科目推荐：先按贷方科目定性（收入 / 货币资金 / 应付账款），
   * 再按原话线索选对应借方，返回候选 + 一句人话理由。
   *
   * 只读、只是「建议」：预填后仍要人工在卡片上确认，改选随时可以。
   */
  async suggestDebit(
    credit: Account | null,
    userText: string,
    limit = 4,
  ): Promise<SuggestItem[]> {
    const leaves = await this.accountRepo.find({ where: { status: 1, isLeaf: true } as any })
    /** 名称优先精确命中；若该科目在本账套下分了子科目，退到第一个含该名称的明细 */
    const resolve = (name: string): Account | null => {
      const target = ACCOUNT_ALIAS[name] ?? name
      const exact = leaves.find((a) => a.name === target)
      if (exact) return exact
      return leaves.find((a) => String(a.fullName ?? '').includes(target)) ?? null
    }

    const source = String(userText ?? '')
    const code = String(credit?.code ?? '').slice(0, 4)
    const name = String(credit?.name ?? '')
    let rules = DEFAULT_RULES
    if (!credit) rules = DEFAULT_RULES
    else if (/^60/.test(code) || /收入$/.test(name)) rules = REVENUE_RULES
    else if (['1001', '1002', '1012'].includes(code)) rules = PAY_RULES
    else if (name.includes('应付账款')) rules = PAYABLE_RULES

    const out: SuggestItem[] = []
    for (const rule of rules) {
      if (rule.cue && !rule.cue.test(source)) continue
      for (const item of rule.names) {
        const account = resolve(item)
        if (!account || out.some((row) => row.account.id === account.id)) continue
        out.push({ account, hint: rule.hint })
        if (out.length >= limit) return out
      }
      // 命中一条规则即可：规则表本身就是从具体到笼统排列的
      break
    }
    return out
  }

  async matchPartner(keyword: string): Promise<MatchResult<Partner>> {
    return this.matchByName(this.partnerRepo as any, keyword)
  }

  /**
   * 从原话里认往来单位（模型漏填时的兜底）。
   *
   * 小模型常把「对方是 光影空间」整段忽略，卡片上客户就空了。
   * 这里拿档案反向扫一遍原话，只认足够强的信号：
   * - 全名出现在原话里；
   * - 去掉地区括注与公司后缀后的核心名出现在原话里（光影空间（广州）视觉科技有限公司 → 光影空间视觉科技）；
   * - 只说核心名前半段也算（「光影空间」⊂「光影空间视觉科技」，至少 3 个字）。
   * 阈值 10 分：2 个字的前缀（「广州」「科技」）拿不到分，避免误认。
   */
  async guessPartner(userText: string): Promise<Partner | null> {
    const source = String(userText ?? '').replace(/\s/g, '')
    if (source.length < 2) return null
    const all = (await this.partnerRepo.find({ where: { status: 1 } as any })) as Partner[]
    if (!all.length) return null

    let best: { row: Partner; score: number } | null = null
    for (const row of all) {
      const full = String(row.name ?? '').replace(/\s/g, '')
      if (!full) continue
      const core = partnerCore(full)
      if (core.length < 2) continue

      let score = 0
      // 全名照抄
      if (source.includes(full)) score = full.length + 20
      // 核心名整体出现
      if (source.includes(core)) score = Math.max(score, core.length + 10)
      // 只说了核心名的前半段：「光影空间」⊂「光影空间视觉科技」
      // 至少 3 个字才算，2 个字（如「广州」「科技」）误伤太多
      for (let len = core.length; len >= 3; len--) {
        if (source.includes(core.slice(0, len))) {
          score = Math.max(score, len + 8)
          break
        }
      }
      if (score && (!best || score > best.score)) best = { row, score }
    }
    return best && best.score >= 10 ? best.row : null
  }

  async matchEmployee(keyword: string): Promise<MatchResult<Employee>> {
    return this.matchByName(this.employeeRepo as any, keyword)
  }

  async matchDepartment(keyword: string): Promise<MatchResult<Department>> {
    return this.matchByName(this.departmentRepo as any, keyword)
  }

  /** 通用名称匹配：精确 → 包含 → 去掉括注/公司后缀再包含 → 双字召回打分 */
  private async matchByName<T extends { id: string; name: string }>(
    repo: CompanyScopedRepository<T>,
    keyword: string,
  ): Promise<MatchResult<T>> {
    const raw = String(keyword ?? '').trim()
    if (!raw) return { hit: null, others: [] }
    const all = await repo.find()
    const exact = all.find((row) => row.name === raw)
    if (exact) return { hit: exact, others: [] }
    const contains = all.filter((row) => row.name.includes(raw) || raw.includes(row.name))
    if (contains.length) return { hit: contains[0], others: contains.slice(1, 4) }

    // 口语只说核心名：「光影空间」↔「光影空间（广州）视觉科技有限公司」
    const core = nameCore(raw)
    if (core.length >= 2) {
      const loose = all.filter((row) => {
        const rowCore = nameCore(String(row.name))
        return rowCore.includes(core) || core.includes(rowCore)
      })
      if (loose.length) return { hit: loose[0], others: loose.slice(1, 4) }
    }

    const scored = all
      .map((row) => ({ row, score: scoreValues(raw, [row.name]) }))
      .filter((item) => item.score > 0)
      .sort((x, y) => y.score - x.score)
    return { hit: scored[0]?.row ?? null, others: scored.slice(1, 4).map((item) => item.row) }
  }
}

/** 去掉地区括注与公司性质后缀，留下「核心名」（带缓存，档案量不大但也别每次重算） */
const coreCache = new Map<string, string>()
export function nameCore(name: string): string {
  const key = String(name ?? '')
  const cached = coreCache.get(key)
  if (cached !== undefined) return cached
  const core = key
    .replace(/\s/g, '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/(有限责任公司|股份有限公司|有限公司|集团|公司|工作室|商行|商店|门市部|事务所|中心|厂|店)$/g, '')
  coreCache.set(key, core)
  return core
}

/** 往来单位核心名：与 nameCore 同口径，单独导出便于测试与阅读 */
function partnerCore(name: string): string {
  return nameCore(name)
}

/**
 * 中文双字召回打分：把候选字段切成 bigram，统计在原话中命中的字数。
 * 对「应收 → 应收账款」「工行 → 工商银行」这类简称足够用，且无需分词依赖。
 */
export function scoreValues(text: string, values: string[]): number {
  const source = String(text ?? '')
  if (!source) return 0
  let best = 0
  for (const value of values) {
    const target = String(value ?? '').trim()
    if (!target) continue
    if (source.includes(target)) best = Math.max(best, target.length * 10)
    if (target.length < 2) continue
    let hit = 0
    for (let i = 0; i < target.length - 1; i++) {
      const gram = target.slice(i, i + 2)
      if (source.includes(gram)) hit += 1
    }
    best = Math.max(best, hit)
  }
  return best
}
