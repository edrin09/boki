import { BadRequestException, Injectable } from '@nestjs/common'
import * as crypto from 'node:crypto'
import type { TokenPayload } from './protocol'

/**
 * 令牌有效期（方案 §3.3 原定 5 分钟）。
 *
 * 卡片现在是可交互的：改科目会重新预演、可能要补客户/部门，
 * 5 分钟对「边核对边改」太紧，放宽到 15 分钟；
 * 「一次性 + 绑人 + 绑账套」这些约束不变，安全性不受影响。
 */
const TTL_MS = 15 * 60 * 1000
/** 内存中最多保留的令牌数（超出按创建时间淘汰最旧） */
const MAX_ENTRIES = 500

/**
 * 一次性令牌仓。
 *
 * - 服务端保存完整 payload，客户端只拿 token 与预览；
 * - token 绑定 companyId / userId / 载荷哈希，跨公司或换人不可用；
 * - commit 后写入 committed 结果，重复提交返回同一结果（幂等）；
 * - 进程内存储：单实例部署（本产品形态即单机/单实例）足够；
 *   若将来网关独立成服务，把这里换成 Redis 即可，接口不变。
 */
@Injectable()
export class TokenStore {
  private readonly entries = new Map<string, TokenPayload>()

  issue(input: {
    planId: string
    action: string
    args: Record<string, unknown>
    previewHash: string
    companyId: string
    userId: string
    source: 'voice' | 'text'
    text: string
    today?: string
    auditId?: string
  }): TokenPayload {
    this.evict()
    const now = Date.now()
    const payload: TokenPayload = {
      token: `t_${crypto.randomBytes(16).toString('hex')}`,
      planId: input.planId,
      action: input.action,
      args: input.args,
      previewHash: input.previewHash,
      companyId: input.companyId,
      userId: input.userId,
      source: input.source,
      text: input.text,
      today: input.today,
      auditId: input.auditId,
      createdAt: now,
      expiresAt: now + TTL_MS,
    }
    this.entries.set(payload.token, payload)
    return payload
  }

  /** 取令牌并做归属校验：过期 / 跨公司 / 换人一律拒绝 */
  require(token: string, companyId: string, userId: string): TokenPayload {
    const found = this.entries.get(String(token ?? ''))
    if (!found) throw new BadRequestException('指令已失效，请重新说一遍')
    if (found.expiresAt < Date.now()) {
      this.entries.delete(found.token)
      throw new BadRequestException('指令已超过 15 分钟，请重新说一遍再确认')
    }
    if (found.companyId !== companyId) {
      throw new BadRequestException('该指令不属于当前账套，已拒绝执行')
    }
    if (found.userId !== userId) {
      throw new BadRequestException('该指令由其他用户发起，不能代为确认')
    }
    if (found.cancelled) throw new BadRequestException('该指令已取消')
    return found
  }

  markCommitted(token: string, result: Record<string, unknown>): void {
    const found = this.entries.get(token)
    if (found) found.committed = result
  }

  cancel(token: string): void {
    const found = this.entries.get(token)
    if (found) found.cancelled = true
  }

  /** 预览指纹：patch 修改后重新计算预览，比对是否与用户看到的一致 */
  hash(value: unknown): string {
    return crypto.createHash('sha256').update(stableStringify(value)).digest('hex')
  }

  private evict(): void {
    const now = Date.now()
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt < now) this.entries.delete(key)
    }
    while (this.entries.size >= MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value
      if (!oldest) break
      this.entries.delete(oldest)
    }
  }
}

/** 稳定的 JSON 序列化（键排序），保证同一份载荷的 hash 可复现 */
function stableStringify(value: unknown): string {
  const walk = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(walk)
    if (input && typeof input === 'object') {
      const out: Record<string, unknown> = {}
      for (const key of Object.keys(input as Record<string, unknown>).sort()) {
        out[key] = walk((input as Record<string, unknown>)[key])
      }
      return out
    }
    return input
  }
  return JSON.stringify(walk(value ?? null))
}
