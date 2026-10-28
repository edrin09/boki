import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { SysConfig } from '@core/entities/sys-config.entity'
import { AI_PROVIDERS, maskKey, type AiProviderPreset } from './ai.providers'

/** AI 模型配置（sys_config 的 ai_model 键，JSON 格式） */
export interface AiModelConfig {
  /** 厂商预设 id（见 AI_PROVIDERS），custom=自定义 */
  provider: string
  /** OpenAI 兼容 Base URL（不含 /chat/completions） */
  baseURL: string
  apiKey: string
  model: string
  /** 总开关：关=所有 AI 能力回退现有规则引擎 */
  enabled: boolean
  temperature: number
  /** 单次请求超时（毫秒） */
  timeoutMs: number
}

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const CONFIG_KEY = 'ai_model'

const DEFAULT_CONFIG: AiModelConfig = {
  provider: 'ollama',
  baseURL: '',
  apiKey: '',
  model: '',
  enabled: false,
  temperature: 0.2,
  timeoutMs: 15000,
}

/**
 * AI 模型接入（OpenAI 兼容协议，统一走 {baseURL}/chat/completions）。
 *
 * - 配置存 sys_config（系统级，不分公司；凭模型 URL/Key 区分在线 or 自部署）
 * - 未配置 / 失败时调用方一律回退现有规则引擎，服务不受影响
 * - Key 落库存明文（本库即本机数据，未上云）；对外接口一律脱敏
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name)
  private cache?: AiModelConfig

  constructor(
    @InjectRepository(SysConfig) private readonly configRepo: Repository<SysConfig>,
  ) {}

  // ==================== 配置 ====================

  async getConfig(): Promise<AiModelConfig> {
    if (this.cache) return this.cache
    const row = await this.configRepo.findOne({ where: { key: CONFIG_KEY } })
    let parsed: Partial<AiModelConfig> = {}
    try {
      parsed = row?.value ? JSON.parse(row.value) : {}
    } catch {
      this.logger.warn('AI 配置 JSON 解析失败，使用默认配置')
    }
    this.cache = { ...DEFAULT_CONFIG, ...parsed }
    return this.cache
  }

  /** 对外展示：Key 脱敏 */
  async getConfigView(): Promise<
    AiModelConfig & { apiKeyMasked: string | null; ready: boolean; providers: AiProviderPreset[] }
  > {
    const cfg = await this.getConfig()
    return {
      ...cfg,
      apiKey: '',
      apiKeyMasked: maskKey(cfg.apiKey),
      ready: this.isReadySync(cfg),
      providers: AI_PROVIDERS,
    }
  }

  /**
   * 保存配置。apiKey 传空串表示清除；不传（undefined）保持原值。
   */
  async saveConfig(dto: Partial<Omit<AiModelConfig, 'apiKey'>> & { apiKey?: string }): Promise<{
    message: string
  }> {
    const current = await this.getConfig()
    const next: AiModelConfig = { ...current }

    if (dto.provider !== undefined) next.provider = (dto.provider || 'custom').trim()
    if (dto.baseURL !== undefined) next.baseURL = this.normalizeBaseURL(dto.baseURL)
    if (dto.model !== undefined) next.model = (dto.model || '').trim()
    if (dto.enabled !== undefined) next.enabled = Boolean(dto.enabled)
    if (dto.temperature !== undefined) {
      next.temperature = Math.min(1, Math.max(0, Number(dto.temperature) || 0))
    }
    if (dto.timeoutMs !== undefined) {
      next.timeoutMs = Math.min(60000, Math.max(3000, Number(dto.timeoutMs) || 15000))
    }
    // apiKey：明文覆盖 / 空串清除 / undefined 保持
    if (dto.apiKey !== undefined) next.apiKey = (dto.apiKey || '').trim()

    const preset = AI_PROVIDERS.find((p) => p.id === next.provider)
    if (next.enabled) {
      if (!next.baseURL) throw new BadRequestException('请先填写接口地址（Base URL）')
      if (!next.model) throw new BadRequestException('请先填写模型名称')
      if (preset?.keyRequired && !next.apiKey) {
        throw new BadRequestException(`厂商「${preset.name}」需要填写 API Key`)
      }
    }
    if (next.enabled && preset?.local && isLoopback(next.baseURL) === false) {
      this.logger.warn(`厂商 ${next.provider} 通常为本地地址，当前配置为 ${next.baseURL}`)
    }

    // key 有唯一约束：先查后存，保证重复保存走 UPDATE 而非 INSERT
    const valueJson = JSON.stringify(next)
    const existingRow = await this.configRepo.findOne({ where: { key: CONFIG_KEY } })
    if (existingRow) {
      existingRow.value = valueJson
      await this.configRepo.save(existingRow)
    } else {
      await this.configRepo.save(
        this.configRepo.create({
          key: CONFIG_KEY,
          value: valueJson,
          remark: 'AI 模型接入配置（OpenAI 兼容）',
        }),
      )
    }
    this.cache = next
    this.logger.log(`AI 模型配置已保存: provider=${next.provider} model=${next.model} enabled=${next.enabled}`)
    return { message: 'AI 模型设置已保存' }
  }

  /** 是否可服务（保存后的就绪状态 = 开启且必填项完整） */
  private isReadySync(cfg: AiModelConfig): boolean {
    return Boolean(cfg.enabled && cfg.baseURL && cfg.model)
  }

  /** 供其他模块判断：AI 是否已接入 */
  async isReady(): Promise<boolean> {
    return this.isReadySync(await this.getConfig())
  }

  async providerOf(id: string): Promise<AiProviderPreset | undefined> {
    return AI_PROVIDERS.find((p) => p.id === id)
  }

  private normalizeBaseURL(url: string): string {
    return (url || '').trim().replace(/\/+$/, '')
  }

  // ==================== 请求 ====================

  /**
   * 调一次 chat/completions，返回首条回复文本。
   * 任何失败以异常抛出，由调用方决定回退策略。
   */
  async chat(
    messages: AiChatMessage[],
    opts?: { temperature?: number; maxTokens?: number; timeoutMs?: number },
  ): Promise<string> {
    const cfg = await this.getConfig()
    if (!this.isReadySync(cfg)) throw new BadRequestException('AI 模型未接入或未开启')

    const url = `${this.normalizeBaseURL(cfg.baseURL)}/chat/completions`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? cfg.timeoutMs)
    try {
      const resp = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: cfg.model,
          messages,
          temperature: opts?.temperature ?? cfg.temperature,
          max_tokens: opts?.maxTokens ?? 512,
          stream: false,
        }),
      })
      if (!resp.ok) {
        const text = (await resp.text().catch(() => '')) || ''
        throw new Error(`HTTP ${resp.status}${text ? `: ${text.slice(0, 300)}` : ''}`)
      }
      const data = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const content = data.choices?.[0]?.message?.content ?? ''
      if (!content.trim()) throw new Error('模型返回空内容')
      return content.trim()
    } catch (err: any) {
      const message =
        err?.name === 'AbortError' ? `请求超时（${opts?.timeoutMs ?? cfg.timeoutMs}ms）` : err?.message
      this.logger.warn(`AI 请求失败: ${message}`)
      throw new BadRequestException(`AI 请求失败: ${message}`)
    } finally {
      clearTimeout(timer)
    }
  }

  /** 设置页「测试连接」 */
  async test(): Promise<{ ok: true; latencyMs: number; model: string }> {
    const cfg = await this.getConfig()
    if (!cfg.baseURL || !cfg.model) throw new BadRequestException('请先填写接口地址和模型名称')
    const startedAt = Date.now()
    try {
      await this.chat([{ role: 'user', content: '请原样回复四个字：连接成功' }], {
        maxTokens: 32,
        timeoutMs: Math.min(cfg.timeoutMs, 20000),
      })
      return { ok: true, latencyMs: Date.now() - startedAt, model: cfg.model }
      await this.chat([{ role: 'user', content: '请原样回复四个字：连接成功' }], {
        maxTokens: 32,
        timeoutMs: Math.min(cfg.timeoutMs, 20000),
      })
      return { ok: true, latencyMs: Date.now() - startedAt, model: cfg.model }
    } catch (err: any) {
      throw new BadRequestException(`连接失败：${(err as Error).message}`)
    }
  }
}

/** 是否本地回环地址（用于日志提示，不拦截） */
function isLoopback(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch {
    return false
  }
}
