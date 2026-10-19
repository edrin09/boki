import { Injectable, Logger } from '@nestjs/common'
import { AiService } from '../ai/ai.service'
import { buildWorkbook } from './excel/excel-builder'
import { saveExport } from './excel/export-store'
import type { IntentCard, IntentColumn, VoiceServices } from './nlu/intent-registry'
import { currentPeriod, periodToYear } from '../../common/utils/date.util'
import type { VoiceQueryResult } from './voice-query.service'

/** 单次提问允许的工具调用轮数上限 */
const MAX_TOOL_TURNS = 5
/** 观测结果最多携带的行数（防止提示词爆炸） */
const MAX_OBS_ROWS = 30

/** 只读查询工具定义：模型看到的是这份清单，执行器按 name 分发 */
interface AgentTool {
  name: string
  label: string
  desc: string
  params: Record<string, string>
}

const TOOLS: AgentTool[] = [
  {
    name: 'monthly_pl',
    label: '月度收支',
    desc: '查询一段期间内逐月的收入/成本/费用/净利润（月份区间，含首尾）。适合盈亏、利润、收支趋势、预测等一切与损益相关的问题。',
    params: { startPeriod: '起始期间 YYYYMM', endPeriod: '结束期间 YYYYMM' },
  },
  {
    name: 'expense_breakdown',
    label: '费用构成',
    desc: '查询一段期间内费用按科目的拆分明细与占比。适合"钱花在哪/费用构成"类问题。',
    params: { startPeriod: '起始期间 YYYYMM', endPeriod: '结束期间 YYYYMM' },
  },
  {
    name: 'ar_list',
    label: '应收明细',
    desc: '查询应收余额明细（客户欠我们的钱）。适合"谁欠我钱/应收"类问题。',
    params: { endPeriod: '截止期间 YYYYMM' },
  },
  {
    name: 'ap_list',
    label: '应付明细',
    desc: '查询应付余额明细（我们欠供应商的钱）。适合"我欠谁钱/应付"类问题。',
    params: { endPeriod: '截止期间 YYYYMM' },
  },
  {
    name: 'fund_balances',
    label: '资金余额',
    desc: '查询各现金/银行账户的当前余额。',
    params: {},
  },
  {
    name: 'loan_balances',
    label: '员工借款',
    desc: '查询员工未还借款余额。',
    params: {},
  },
  {
    name: 'voucher_stats',
    label: '凭证统计',
    desc: '查询一段期间已审核凭证的张数与借贷合计。',
    params: { startPeriod: '起始期间 YYYYMM', endPeriod: '结束期间 YYYYMM' },
  },
]

const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]))

/** 工具观测结果（用于生成结果卡片） */
interface ToolObservation {
  tool: string
  result: Record<string, unknown>
}

/** 期间参数校验与兜底：非法/缺失时回落到合理值 */
function normalizePeriod(value: unknown, fallback: number): number {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n < 190001 || n > 299912 || n % 100 < 1 || n % 100 > 12) {
    return fallback
  }
  return n
}

/** 通用数值行 → 结果卡片列（数值列自动识别） */
function columnsFromRows(rows: Array<Record<string, unknown>>): IntentColumn[] {
  const first = rows[0] ?? {}
  return Object.keys(first).map((key) => ({
    key,
    label: FIELD_LABELS[key] ?? key,
    numeric: rows.some((r) => typeof r[key] === 'number'),
    width: typeof first[key] === 'string' && String(first[key]).length > 12 ? 20 : undefined,
  }))
}

const FIELD_LABELS: Record<string, string> = {
  month: '月份',
  revenue: '收入',
  cost: '成本',
  expense: '费用',
  net: '净利润',
  name: '名称',
  total: '合计',
  items: '明细',
  percent: '占比(%)',
  partnerName: '往来单位',
  amount: '金额',
  directionLabel: '方向',
  employeeName: '员工',
  loanCount: '笔数',
  count: '凭证张数',
  debit: '借方合计',
  credit: '贷方合计',
  typeLabel: '类型',
  balance: '余额',
}

/**
 * AI 智能体查询通道（通用自然语言 → 查库 → 回答）。
 *
 * 与固定意图清单互补：关键词命中走意图（零延迟、格式固定）；
 * 未命中且已接 AI 时进入本通道 —— 模型根据问题自主选择只读查询工具、
 * 组合真实账务数据后作答。新增问法/新需求不再需要改代码。
 *
 * 协议（纯 JSON 文本，兼容任意 OpenAI 协议模型，不依赖原生 function calling）：
 *   {"action":"工具名","params":{...}}        → 需要数据
 *   {"answer":"给用户的最终回答"}             → 已可回答
 */
@Injectable()
export class AiAgentService {
  private readonly logger = new Logger('AiAgent')

  constructor(private readonly ai: AiService) {}

  async run(
    text: string,
    svc: VoiceServices,
  ): Promise<VoiceQueryResult | null> {
    if (!(await this.ai.isReady())) return null

    const nowPeriod = currentPeriod()
    const now = new Date()
    const system = [
      '你是记账软件的财务智能助手，根据用户问题查询真实账务数据后回答。',
      `当前日期：${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日；当前会计期间：${nowPeriod}（YYYYMM 格式）。`,
      '你有以下只读查询工具：',
      JSON.stringify(TOOLS.map(({ name, desc, params }) => ({ name, desc, params }))),
      '规则：',
      '1. 每次只输出一个 JSON 对象，不要输出任何其他文字：',
      '   需要数据时：{"thought":"一句话理由","action":"工具名","params":{...}}',
      '   已能回答时：{"answer":"给用户的完整回答"}',
      '2. answer 里所有数字必须来自工具返回的数据，禁止编造；金额单位为元；回答简洁口语化，可含一句基于数据的分析或预测推断（推断需说明是估算）。answer 用纯文本，不要使用 Markdown 符号（如 **、#）。answer 尽量控制在 150 字以内，避免 JSON 被截断。',
      '3. 期间用 YYYYMM 整数；"上个月/近三个月/下个月"等相对时间请按当前期间自行推算。',
      '4. 用户的问题可能包含多个子问题（如"还剩多少钱？够撑几个月？"），必须把每个子问题都查到数据后再回答，不要只查一个就抢答。一次需要多组数据时逐轮调用工具，每次一个。',
    ].join('\n')

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: system },
      { role: 'user', content: `用户问题：${text}` },
    ]

    let lastObs: ToolObservation | null = null

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      let content: string
      try {
        // 思考型模型（Qwen3 等）思维链较长：max_tokens/超时给足，否则正文为空
        content = await this.ai.chat(messages, { temperature: 0.1, maxTokens: 1200, timeoutMs: 240000 })
      } catch (err) {
        this.logger.warn(`AI 智能体请求失败: ${(err as Error).message}`)
        return null
      }

      const parsed = extractJson(content)
      if (!parsed) {
        // 实测 Qwen3 等模型在拿到工具数据后的最后一轮，偶尔会丢弃 JSON 协议、
        // 直接输出答案文本（不含花括号）。此时把内容当作最终回答采纳，避免整轮白费。
        const plain = content.trim()
        if (turn > 0 && plain && !plain.includes('{')) {
          const answer = plain.replace(/\*\*/g, '').replace(/#{1,4}\s*/g, '').trim()
          if (answer) {
            const card = this.buildCard(lastObs)
            let exportId: string | undefined
            if (card.rows.length) {
              const buffer = buildWorkbook(card.title, card.columns, card.rows, card.totals ?? null)
              const stamp = new Date()
              const saved = saveExport(
                buffer,
                `${card.title}_${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}_${String(stamp.getHours()).padStart(2, '0')}${String(stamp.getMinutes()).padStart(2, '0')}.xlsx`,
              )
              exportId = saved.exportId
            }
            this.logger.log(`AI 智能体回答(纯文本兜底): "${text}" (tools=${turn})`)
            return {
              transcript: text,
              intentId: 'ai.agent',
              intentTitle: card.title,
              reply: answer,
              card,
              exportId,
            }
          }
        }
        this.logger.warn(`AI 智能体返回非 JSON: ${content.slice(0, 120)}`)
        return null
      }

      // ---- 最终回答 ----
      if (typeof parsed.answer === 'string' && parsed.answer.trim()) {
        // 去掉模型偶尔带出的 Markdown 加粗等符号（语音播报不需要）
        const answer = parsed.answer.replace(/\*\*/g, '').replace(/#{1,4}\s*/g, '').trim()
        const card = this.buildCard(lastObs)
        let exportId: string | undefined
        if (card.rows.length) {
          const buffer = buildWorkbook(card.title, card.columns, card.rows, card.totals ?? null)
          const stamp = new Date()
          const saved = saveExport(
            buffer,
            `${card.title}_${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}_${String(stamp.getHours()).padStart(2, '0')}${String(stamp.getMinutes()).padStart(2, '0')}.xlsx`,
          )
          exportId = saved.exportId
        }
        this.logger.log(`AI 智能体回答: "${text}" (tools=${turn})`)
        return {
          transcript: text,
          intentId: 'ai.agent',
          intentTitle: card.title,
          reply: answer,
          card,
          exportId,
        }
      }

      // ---- 工具调用 ----
      const action = String(parsed.action ?? '')
      const tool = TOOL_MAP.get(action)
      if (!tool) {
        messages.push({ role: 'assistant', content })
        messages.push({
          role: 'user',
          content: `{"error":"未知工具 ${action}。请改为 answer 或从工具清单中选择"}`,
        })
        continue
      }

      let result: Record<string, unknown>
      try {
        result = await this.execTool(tool, (parsed.params ?? {}) as Record<string, unknown>, svc)
      } catch (err) {
        messages.push({ role: 'assistant', content })
        messages.push({
          role: 'user',
          content: `{"error":"工具 ${action} 执行失败: ${(err as Error).message}。请修正参数重试或直接 answer"}`,
        })
        continue
      }

      lastObs = { tool: action, result }
      messages.push({ role: 'assistant', content })
      messages.push({
        role: 'user',
        content: `工具 ${action} 返回：${JSON.stringify(result).slice(0, 6000)}\n若数据已足够，请输出 {"answer":"..."}。`,
      })
    }

    this.logger.warn(`AI 智能体超过最大轮数未给出答案: "${text}"`)
    return null
  }

  // ==================== 工具执行 ====================

  private async execTool(
    tool: AgentTool,
    params: Record<string, unknown>,
    svc: VoiceServices,
  ): Promise<Record<string, unknown>> {
    const nowPeriod = currentPeriod()
    const startPeriod = normalizePeriod(params.startPeriod, nowPeriod)
    const endPeriod = normalizePeriod(params.endPeriod, startPeriod)
    const [s, e] = startPeriod <= endPeriod ? [startPeriod, endPeriod] : [endPeriod, startPeriod]

    switch (tool.name) {
      case 'monthly_pl': {
        // 跨度保护：最多 24 个月
        const cappedEnd = Math.min(e, addMonths(s, 23))
        const months: Array<Record<string, unknown>> = []
        for (let p = s; p <= cappedEnd; p = addMonths(p, 1)) {
          const pl = await svc.reportsService.profitLoss({
            startPeriod: p,
            endPeriod: p,
            fiscalYear: periodToYear(p),
          })
          const t = pl.currentPeriod?.totals ?? {}
          months.push({
            month: `${periodToYear(p)}年${p % 100}月`,
            revenue: round2(t.operatingRevenue),
            cost: round2(t.operatingCost),
            expense: round2(
              Number(t.sellingExpense ?? 0) +
                Number(t.adminExpense ?? 0) +
                Number(t.rdExpense ?? 0) +
                Number(t.financialExpense ?? 0) +
                Number(t.taxAndSurcharge ?? 0),
            ),
            net: round2(t.netProfit),
          })
        }
        return { months }
      }
      case 'expense_breakdown': {
        const res = await svc.analysisService.expenseAnalysis({ startPeriod: s, endPeriod: e })
        const items = (res.byAccount as any[] ?? [])
          .map((g) => ({
            name: g.name,
            amount: round2(g.amount),
            percent: round2(g.percent),
          }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, MAX_OBS_ROWS)
        return { startPeriod: s, endPeriod: e, total: round2(res.total), items }
      }
      case 'ar_list': {
        const res = await svc.arApService.receivable({ endPeriod: e, onlyWithBalance: 'true' })
        return {
          endPeriod: e,
          rows: obsRows(
            (res.rows as any[]).map((r) => ({
              partnerName: r.partnerName ?? '未指定往来单位',
              amount: round2(Math.abs(Number(r.closingBalance ?? 0))),
              directionLabel: r.direction === 'debit' ? '借（对方欠款）' : '贷（我方欠款）',
            })),
          ),
        }
      }
      case 'ap_list': {
        const res = await svc.arApService.payable({ endPeriod: e, onlyWithBalance: 'true' })
        return {
          endPeriod: e,
          rows: obsRows(
            (res.rows as any[]).map((r) => ({
              partnerName: r.partnerName ?? '未指定往来单位',
              amount: round2(Math.abs(Number(r.closingBalance ?? 0))),
              directionLabel: r.direction === 'debit' ? '借（对方欠款）' : '贷（我方欠款）',
            })),
          ),
        }
      }
      case 'fund_balances': {
        const rows = await svc.bankRepo.list()
        return { rows: obsRows(rows as unknown as Array<Record<string, unknown>>) }
      }
      case 'loan_balances': {
        const { list } = await svc.settlementService.employeeBalances({
          page: 1,
          pageSize: 200,
        })
        const rows = (list as any[])
          .map((b) => ({
            employeeName: b.employeeName,
            loanCount: b.loanCount,
            amount: round2(Math.abs(Number(b.balance ?? 0))),
          }))
          .filter((r) => r.amount > 0)
        return { rows: obsRows(rows as Array<Record<string, unknown>>) }
      }
      case 'voucher_stats': {
        const { count, debit, credit } = await svc.voucherRepo.countAll({
          startPeriod: s,
          endPeriod: e,
          label: `${Math.floor(s / 100)}年${s % 100}月 至 ${Math.floor(e / 100)}年${e % 100}月`,
          fiscalYear: periodToYear(e),
        })
        return { startPeriod: s, endPeriod: e, count, debit: round2(debit), credit: round2(credit) }
      }
      default:
        throw new Error(`未实现的工具 ${tool.name}`)
    }
  }

  /** 最近一次工具观测 → 通用结果卡片（供前端表格展示与 Excel 导出） */
  private buildCard(obs: ToolObservation | null): IntentCard {
    if (!obs) return { title: '智能查询', columns: [], rows: [] }
    const tool = TOOL_MAP.get(obs.tool)
    const title = tool?.label ?? '智能查询'
    const arrayKey = Object.keys(obs.result).find((k) => Array.isArray(obs.result[k]))
    const rows = arrayKey
      ? (obs.result[arrayKey] as Array<Record<string, unknown>>).slice(0, MAX_OBS_ROWS)
      : [obs.result]
    if (!rows.length) return { title, columns: [], rows: [] }
    const columns = columnsFromRows(rows)
    return {
      title,
      columns,
      rows,
      totals: null,
    }
  }
}

/** 行数截断 */
function obsRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return rows.slice(0, MAX_OBS_ROWS)
}

function round2(value: unknown): number {
  return Math.round(Number(value ?? 0) * 100) / 100
}

function addMonths(period: number, offset: number): number {
  const y = Math.floor(period / 100)
  const m = period % 100
  const total = y * 12 + (m - 1) + offset
  return Math.floor(total / 12) * 100 + ((total % 12) + 1)
}

/** 从模型返回中提取 JSON 对象（容忍代码块/前后废话；JSON 被截断时抢救 answer 字段） */
function extractJson(content: string): Record<string, unknown> | null {
  const match = content.match(/\{[\s\S]*\}/)
  if (match) {
    try {
      return JSON.parse(match[0]) as Record<string, unknown>
    } catch {
      /* 落到下面的容错提取 */
    }
  }
  // JSON 被截断（finish_reason=length）时，至少把 answer 字符串抢救出来
  const ans = content.match(/"answer"\s*:\s*"((?:[^"\\]|\\.)*)/)
  if (ans) {
    try {
      return { answer: JSON.parse(`"${ans[1]}"`) as unknown }
    } catch {
      return null
    }
  }
  return null
}
