import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common'
import { requireCompanyId } from '@core/common/company/company-context'
import type { CurrentUser } from '@core/common/interfaces/jwt-payload.interface'
import { ActionRegistry } from './action.registry'
import { CompilerService } from './compiler.service'
import { TokenStore } from './token.store'
import { AuditService } from './audit.service'
import type {
  ActionContext,
  ActionManifest,
  CommitResult,
  ParamSpec,
  PlanResult,
  Preview,
} from './protocol'
import { todayString } from '../actions/action.util'

/** 无法识别时的返回（不带 token，前端只展示追问） */
export interface UnsupportedPlan {
  unsupported: true
  action: 'unsupported'
  ask: string
  title: string
}

export type PlanOutcome = PlanResult | UnsupportedPlan

/**
 * 指令网关（方案 §3 / §8）。
 *
 * 唯一允许写库的入口，负责：白名单、权限、补 ID、预演、一次性 token、
 * 幂等、审计。业务规则一律不在这里——在 actions/ 适配器。
 */
@Injectable()
export class GatewayService {
  private readonly logger = new Logger('AiVoiceGateway')

  constructor(
    private readonly compiler: CompilerService,
    private readonly registry: ActionRegistry,
    private readonly tokens: TokenStore,
    private readonly audit: AuditService,
  ) {}

  // ==================== plan（只读） ====================

  async plan(
    input: { text: string; source?: 'voice' | 'text'; today?: string },
    user: CurrentUser,
  ): Promise<PlanOutcome> {
    const text = String(input.text ?? '').trim()
    if (!text) throw new BadRequestException('请说一句话，或直接输入指令')
    if (text.length > 300) throw new BadRequestException('这句话太长了，请精简到 300 字以内')

    const source = input.source === 'voice' ? 'voice' : 'text'
    // 「今天」以用户本地日期为准（浏览器传），服务端只做 ±2 天合理性校验：
    // 服务器多为 UTC，直接用服务器日期会让「今天」在跨零点时段差一天
    const today = this.normalizeToday(input.today)
    const compiled = await this.compiler.compile(text, today)

    if (compiled.action === 'unsupported') {
      return {
        unsupported: true,
        action: 'unsupported',
        ask: compiled.ask || '这个操作我还不会，可以试试记账、发工资、加人员、改凭证、审凭证',
        title: '暂不支持',
      }
    }

    const adapter = this.registry.get(compiled.action)!
    const ctx = this.contextOf(user, text, source, today)
    const preview = await adapter.preview(compiled.args, ctx)

    const companyId = requireCompanyId()
    const previewHash = this.tokens.hash({ action: compiled.action, args: compiled.args, preview })

    // 先落审计（planned），再发令牌：令牌里带 auditId，commit 时回写结果
    const token = this.tokens.issue({
      planId: '',
      action: compiled.action,
      args: compiled.args,
      previewHash,
      companyId,
      userId: user.id,
      source,
      text,
      today,
    })
    const record = await this.audit.planned(
      { ...token } as any,
      ctx.operator,
      compiled.action,
      compiled.args,
      previewHash,
    )
    token.planId = `p_${record.id.slice(0, 8)}`
    token.auditId = record.id

    this.logger.log(`plan ${compiled.action} "${text}" missing=${preview.missing.length}`)

    return {
      planId: token.planId,
      action: compiled.action,
      title: adapter.manifest.title,
      args: compiled.args,
      missing: preview.missing,
      preview,
      token: token.token,
      expiresAt: new Date(token.expiresAt).toISOString(),
      ask: compiled.ask,
    }
  }

  // ==================== refresh（只读，交互用） ====================

  /**
   * 用户改了卡片上的字段后重新预演：只读，不发新令牌、不写审计。
   *
   * 卡片是活的——改了借方科目，分录、缺项、警告都得跟着变，
   * 否则会出现「部门明明填了，按钮还是灰的」这种对不上的状态。
   */
  async refresh(
    input: { token: string; patch?: Record<string, unknown> },
    user: CurrentUser,
  ): Promise<{ action: string; args: Record<string, unknown>; preview: Preview }> {
    const payload = this.tokens.require(String(input.token ?? ''), requireCompanyId(), user.id)
    const adapter = this.registry.get(payload.action)
    if (!adapter) throw new BadRequestException(`不支持的操作：${payload.action}`)

    const merged = this.mergePatch(payload.args, input.patch, adapter.manifest)
    const ctx = this.contextOf(user, payload.text, payload.source, payload.today || todayString())
    const preview = await adapter.preview(merged, ctx)
    return { action: payload.action, args: merged, preview }
  }

  // ==================== commit（唯一写库入口） ====================

  async commit(
    input: { token: string; patch?: Record<string, unknown>; confirmed?: boolean },
    user: CurrentUser,
  ): Promise<CommitResult> {
    const companyId = requireCompanyId()
    const payload = this.tokens.require(String(input.token ?? ''), companyId, user.id)

    if (!input.confirmed) {
      throw new BadRequestException('请先在卡片上确认，再执行')
    }

    // 幂等：同一 token 重复提交返回首次结果
    if (payload.committed) {
      return {
        ok: true,
        result: payload.committed,
        auditId: payload.auditId ?? '',
        idempotent: true,
      }
    }

    const adapter = this.registry.get(payload.action)
    if (!adapter) throw new BadRequestException(`不支持的操作：${payload.action}`)
    this.assertPermission(user, adapter.manifest)

    const merged = this.mergePatch(payload.args, input.patch, adapter.manifest)
    // 沿用 plan 阶段的「今天」，保证预览里的默认日期与实际入账一致
    const ctx = this.contextOf(user, payload.text, payload.source, payload.today || todayString())

    // 改动后重跑一次预演：服务端不接受「用户看到的预览」与「实际入账」不一致
    const preview = await adapter.preview(merged, ctx)
    if (preview.missing.length) {
      throw new BadRequestException(`还缺：${preview.missing.map((item) => item.label).join('、')}`)
    }

    try {
      const result = await adapter.commit(merged, ctx)
      this.tokens.markCommitted(payload.token, result)
      if (payload.auditId) await this.audit.committed(payload.auditId, result)
      this.logger.log(`commit ${payload.action} ok`)
      return { ok: true, result, auditId: payload.auditId ?? '' }
    } catch (err) {
      const message = (err as Error).message ?? '执行失败'
      if (payload.auditId) await this.audit.failed(payload.auditId, message)
      this.logger.warn(`commit ${payload.action} 失败：${message}`)
      throw err
    }
  }

  // ==================== cancel ====================

  async cancel(token: string, user: CurrentUser): Promise<{ ok: true }> {
    const payload = this.tokens.require(String(token ?? ''), requireCompanyId(), user.id)
    this.tokens.cancel(payload.token)
    if (payload.auditId) await this.audit.cancelled(payload.auditId)
    return { ok: true }
  }

  // ==================== 内部 ====================

  /** 客户端传入的本地日期：格式合法且与服务器日期相差 ≤2 天才采纳 */
  private normalizeToday(input?: string): string {
    const server = todayString()
    const text = String(input ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return server
    const diff = Math.abs(Date.parse(text) - Date.parse(server))
    if (!Number.isFinite(diff) || diff > 2 * 86400000) return server
    return text
  }

  private contextOf(
    user: CurrentUser,
    text: string,
    source: 'voice' | 'text',
    today: string,
  ): ActionContext {
    return {
      operator: { id: user.id, nickname: user.nickname || user.username || '未知用户' },
      permissions: user.permissions ?? [],
      today,
      text,
      source,
    }
  }

  /** 动作级二次权限：不能用「能用 AI」代替底层业务权限 */
  private assertPermission(user: CurrentUser, manifest: ActionManifest): void {
    const roles = user.roles ?? []
    if (roles.includes('admin')) return
    const owned = user.permissions ?? []
    if (!owned.includes(manifest.permission)) {
      throw new ForbiddenException(`无权限执行「${manifest.title}」，需要权限：${manifest.permission}`)
    }
  }

  /**
   * 合并用户改动：只承认 manifest 里 editable 的字段，其余静默忽略。
   * 类型按 ParamSpec 收口，避免前端传字符串把金额写坏。
   */
  private mergePatch(
    args: Record<string, unknown>,
    patch: Record<string, unknown> | undefined,
    manifest: ActionManifest,
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...args }
    if (!patch || typeof patch !== 'object') return merged

    for (const [key, value] of Object.entries(patch)) {
      const spec: ParamSpec | undefined = manifest.params[key]
      if (!spec?.editable) continue
      if (value === undefined || value === null || value === '') {
        delete merged[key]
        continue
      }
      if (spec.type === 'number') {
        const num = Number(String(value).replace(/[,，元\s￥¥]/g, ''))
        if (Number.isFinite(num)) merged[key] = Math.round(num * 100) / 100
        continue
      }
      merged[key] = String(value).trim().slice(0, 200)
    }
    return merged
  }
}
