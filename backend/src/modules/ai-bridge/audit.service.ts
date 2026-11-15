import type { CompanyScopedRepository } from '../../common/company/company.repository'
import type { TokenPayload } from './protocol'

/**
 * AI 指令审计（内核逻辑，表由归属插件提供）。
 *
 * 为什么是普通类而不是 @Injectable：
 * 审计表 `fin_ai_voice_audit` 属于插件表（插件清单里声明），内核不能反向依赖
 * 插件实体。这里只固化「怎么写审计」的逻辑，仓储由调用方在模块里用
 * `useFactory` 注入（见 receipts 的 ai-voice.module.ts），
 * 既避免插件各写一份审计实现，也不破坏「插件拥有自己的表」这条边界。
 */

/** 审计行中内核会读取的字段（不绑定具体实体类） */
export interface AiAuditRecord {
  id: string
  action: string
  source: string
  transcript: string | null
  status: string
  message: string | null
  resultJson: string | null
  userId: string
  userName: string
  createdAt: Date
}

export interface AiAuditRecent {
  id: string
  action: string
  source: string
  transcript: string | null
  status: string
  message: string | null
  result: Record<string, unknown> | null
  userId: string
  userName: string
  createdAt: Date
}

export class AiAuditService {
  constructor(private readonly repo: CompanyScopedRepository<any>) {}

  async planned(
    payload: TokenPayload,
    operator: { id: string; nickname: string },
    action: string,
    args: Record<string, unknown>,
    previewHash: string,
  ): Promise<AiAuditRecord> {
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
    return this.repo.save(entity) as unknown as Promise<AiAuditRecord>
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

  /** 指令历史（倒序），供指令历史面板展示 */
  async recent(limit = 30): Promise<AiAuditRecent[]> {
    const rows = (await this.repo.find({
      order: { createdAt: 'DESC' } as any,
      take: Math.min(Math.max(limit, 1), 100),
    })) as AiAuditRecord[]
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      source: row.source,
      transcript: row.transcript,
      status: row.status,
      message: row.message,
      result: parseJson(row.resultJson),
      // 昵称可以重名，追责要靠 ID；对外只读接口一并给出
      userId: row.userId,
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
