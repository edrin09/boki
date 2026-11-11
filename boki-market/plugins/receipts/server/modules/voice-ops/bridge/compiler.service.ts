import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { AiService } from '@plugin/ai/server/modules/ai/ai.service'
import { ActionRegistry } from './action.registry'
import { CatalogService } from './catalog.service'
import type { CompiledInstruction, ParamSpec } from './protocol'
import {
  SKILL_EXAMPLES,
  SKILL_RULES,
  SKILL_SCHEMA,
  SKILL_TERMS,
} from '../skills/bookkeeping.skill'
import { scoreValues } from './catalog.service'

/** few-shot 条数：小模型上下文有限，只给最相关的几条 */
const MAX_EXAMPLES = 5

/**
 * 指令编译器：自然语言 → {action, args}。
 *
 * 只做「听懂」，不做「做到」：
 * - 输出被约束为单个 JSON；
 * - 只喂动作清单、参数 schema、top-N 候选；
 * - 任何不确定都要求模型省略参数，由服务端追问，禁止猜。
 */
@Injectable()
export class CompilerService {
  private readonly logger = new Logger('AiVoiceCompiler')

  constructor(
    private readonly ai: AiService,
    private readonly registry: ActionRegistry,
    private readonly catalog: CatalogService,
  ) {}

  async ready(): Promise<boolean> {
    return this.ai.isReady()
  }

  /** 编译一句口语；模型不可用/输出非法时抛人类可读错误 */
  async compile(text: string, today: string): Promise<CompiledInstruction> {
    if (!(await this.ai.isReady())) {
      throw new BadRequestException('AI 模型未接入，请先在「系统管理 → AI 模型接入」里配置')
    }

    const catalog = await this.catalog.recall(text)
    const system = this.buildSystemPrompt(today, catalog, text)

    let content: string
    try {
      content = await this.ai.chat(
        [
          { role: 'system', content: system },
          { role: 'user', content: `用户原话：${text}` },
        ],
        { temperature: 0.1, maxTokens: 800, timeoutMs: 90000 },
      )
    } catch (err) {
      throw new BadRequestException(`AI 解析失败：${(err as Error).message}`)
    }

    const parsed = extractJson(content)
    if (!parsed) {
      this.logger.warn(`模型返回非 JSON: ${content.slice(0, 160)}`)
      throw new BadRequestException('没听懂这句话，换个说法再说一次（例如「记一笔 5000 办公费，银行付的」）')
    }

    if (parsed.unsupported === true) {
      return {
        action: 'unsupported',
        args: {},
        ask: String(parsed.ask ?? '这个操作我还不会，可以试试记账、发工资、加人员、改凭证、审凭证'),
      }
    }

    const action = String(parsed.action ?? '').trim()
    if (!action || !this.registry.has(action)) {
      this.logger.warn(`模型给了未注册动作: ${action || '(空)'}`)
      return {
        action: 'unsupported',
        args: {},
        ask: String(parsed.ask ?? '这个操作我还不会，可以试试记账、发工资、加人员、改凭证、审凭证'),
      }
    }

    const adapter = this.registry.get(action)!
    const args = this.normalizeArgs(parsed.args, adapter.manifest.params)
    return { action, args, ask: typeof parsed.ask === 'string' ? parsed.ask.trim() : undefined }
  }

  // ==================== prompt ====================

  private buildSystemPrompt(
    today: string,
    catalog: Awaited<ReturnType<CatalogService['recall']>>,
    text: string,
  ): string {
    const actions = this.registry.manifests().map((item) => ({
      action: item.id,
      title: item.title,
      description: item.description,
      params: Object.entries(item.params).map(([key, spec]) => ({
        key,
        type: spec.type,
        required: spec.required === true,
        ...(spec.enum ? { enum: spec.enum } : {}),
        ...(spec.description ? { hint: spec.description } : {}),
      })),
    }))

    return [
      ...SKILL_RULES,
      '',
      `今天是 ${today}。`,
      '',
      '【可用动作】',
      JSON.stringify(actions),
      '',
      '【输出结构】',
      SKILL_SCHEMA,
      '',
      '【示例】',
      ...pickExamples(text),
      '',
      '【口径】',
      ...SKILL_TERMS.map((line) => `- ${line}`),
      '',
      '【本账套候选档案（只能用这里的名字，不要编造）】',
      `会计科目：${catalog.accounts.map((a) => `${a.code} ${a.name}${a.aux ? `(辅助:${a.aux})` : ''}`).join('；') || '（无）'}`,
      `往来单位：${catalog.partners.join('、') || '（无）'}`,
      `员工：${catalog.employees.join('、') || '（无）'}`,
      `部门：${catalog.departments.join('、') || '（无）'}`,
      `资金账户：${catalog.bankAccounts.join('、') || '（无）'}`,
    ].join('\n')
  }

  // ==================== 参数规范化 ====================

  /**
   * 按 manifest 收口参数：
   * - 丢掉未声明字段（防模型夹带主键/SQL）
   * - 数字转 number、日期转 YYYY-MM-DD、枚举校验
   * - 金额保留两位小数
   */
  private normalizeArgs(
    raw: unknown,
    params: Record<string, ParamSpec>,
  ): Record<string, unknown> {
    const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const out: Record<string, unknown> = {}

    for (const [key, spec] of Object.entries(params)) {
      const value = source[key]
      if (value === undefined || value === null || value === '') continue

      if (spec.type === 'number') {
        const raw = String(value).trim()
        // 期间容错：模型偶尔给 2026-10 / 2026/10，统一成 YYYYMM
        const periodLike = raw.match(/^(\d{4})[-/年](\d{1,2})月?$/)
        const num = periodLike
          ? Number(`${periodLike[1]}${periodLike[2].padStart(2, '0')}`)
          : Number(raw.replace(/[,，元\s￥¥]/g, ''))
        if (!Number.isFinite(num)) continue
        out[key] = Math.round(num * 100) / 100
        continue
      }

      if (spec.type === 'date') {
        const normalized = normalizeDate(String(value))
        if (normalized) out[key] = normalized
        continue
      }

      if (spec.type === 'enum') {
        const text = String(value).trim()
        if (!spec.enum || spec.enum.includes(text)) out[key] = text
        continue
      }

      const text = String(value).trim()
      if (text) out[key] = text.slice(0, 200)
    }

    return out
  }
}

/** 取最相关的几条 few-shot（按原话与示例文本的双字重合度） */
export function pickExamples(text: string): string[] {
  return SKILL_EXAMPLES.map((item) => ({ item, score: scoreValues(text, [item.text]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_EXAMPLES)
    .map(
      ({ item }) =>
        `用户：${item.text}\n输出：${JSON.stringify({ action: item.action, args: item.args })}`,
    )
}

/** 从模型返回里抠 JSON（容忍代码块、前后废话、被截断） */
function extractJson(content: string): Record<string, unknown> | null {
  const trimmed = String(content ?? '').trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : trimmed
  const match = candidate.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0])
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** 日期规范化：只接受 YYYY-MM-DD（模型必须已换算好），其余一律丢弃 */
function normalizeDate(value: string): string | null {
  const text = value.trim()
  const direct = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (direct) {
    const [, y, m, d] = direct
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const cn = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?$/)
  if (cn) {
    const [, y, m, d] = cn
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}
