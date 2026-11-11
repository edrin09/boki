import { Injectable } from '@nestjs/common'
import { InjectCompanyRepo } from '@core/common/company/company-repo.decorator'
import type { CompanyScopedRepository } from '@core/common/company/company.repository'
import { AiVoiceAudit } from './entities/ai-voice-audit.entity'
import type { TokenPayload } from './protocol'

/**
 * 审计留痕：方案 §8 要求的最小集。
 *
 * 只增不改（除状态迁移），供「指令历史」页面只读展示。
 */
@Injectable()
export class AuditService {
  constructor(
    @InjectCompanyRepo(AiVoiceAudit)
    private readonly repo: CompanyScopedRepository<AiVoiceAudit>,
  ) {}

  async planned(
    payload: TokenPayload,
    operator: { id: string; nickname: string },
    action: string,
    args: Record<string, unknown>,
    previewHash: string,
  ): Promise<AiVoiceAudit> {
    const entity = this.repo.create({
      userId: operator.id,
      userName: operator.nickname,
      source: payload.source,
      transcript: payload.text,
      action,
      argsJson: safeStringify(args),
      previewHash,
      status: 'planned',
      token: payload.token,
    })
    return this.repo.save(entity)
  }

  async committed(id: string, result: Record<string, unknown>): Promise<void> {
    await this.repo.update({ id }, { status: 'committed', resultJson: safeStringify(result) })
  }

  async failed(id: string, message: string): Promise<void> {
    await this.repo.update({ id }, { status: 'failed', message: message.slice(0, 500) })
  }

  async cancelled(id: string): Promise<void> {
    await this.repo.update({ id }, { status: 'cancelled' })
  }

  /** 指令历史（倒序），供记账台页面展示 */
  async recent(limit = 30): Promise<
    Array<{
      id: string
      action: string
      source: string
      transcript: string | null
      status: string
      message: string | null
      result: Record<string, unknown> | null
      userName: string
      createdAt: Date
    }>
  > {
    const rows = await this.repo.find({
      order: { createdAt: 'DESC' } as any,
      take: Math.min(Math.max(limit, 1), 100),
    })
    return (rows as AiVoiceAudit[]).map((row) => ({
      id: row.id,
      action: row.action,
      source: row.source,
      transcript: row.transcript,
      status: row.status,
      message: row.message,
      result: parseJson(row.resultJson),
      userName: row.userName,
      createdAt: row.createdAt,
    }))
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? {})
  } catch {
    return '{}'
  }
}

function parseJson(value: string | null): Record<string, unknown> | null {
  if (!value) return null
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return null
  }
}
