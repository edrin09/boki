import { Injectable } from '@nestjs/common'
import type { CurrentUser } from '@core/common/interfaces/jwt-payload.interface'
import { InjectCompanyRepo } from '@core/common/company/company-repo.decorator'
import type { CompanyScopedRepository } from '@core/common/company/company.repository'
import { Voucher } from '@core/entities/voucher.entity'
import { VoucherStatus } from '@core/common/enums'
import { ActionRegistry } from './bridge/action.registry'
import { CompilerService } from './bridge/compiler.service'
import { GatewayService, type PlanOutcome } from './bridge/gateway.service'
import { AuditService } from './bridge/audit.service'
import type { ActionManifest, CommitResult, Preview } from './bridge/protocol'

/**
 * 插件门面：给 Controller 一个薄壳，内部全部委托给 bridge 层。
 *
 * 这样「协议内核」与「插件装配」解耦，将来把 bridge 抽成独立包/服务时
 * （方案 §9），只换这里的装配即可。
 */
@Injectable()
export class AiVoiceService {
  constructor(
    private readonly gateway: GatewayService,
    private readonly compiler: CompilerService,
    private readonly registry: ActionRegistry,
    private readonly audit: AuditService,
    @InjectCompanyRepo(Voucher) private readonly voucherRepo: CompanyScopedRepository<Voucher>,
  ) {}

  capabilities(): ActionManifest[] {
    return this.registry.manifests()
  }

  aiReady(): Promise<boolean> {
    return this.compiler.ready()
  }

  plan(
    input: { text: string; source?: 'voice' | 'text'; today?: string },
    user: CurrentUser,
  ): Promise<PlanOutcome> {
    return this.gateway.plan(input, user)
  }

  commit(
    input: { token: string; patch?: Record<string, unknown>; confirmed?: boolean },
    user: CurrentUser,
  ): Promise<CommitResult> {
    return this.gateway.commit(input, user)
  }

  /** 改字段后重新预演（只读）：卡片上的分录/缺项要跟着变 */
  refresh(
    input: { token: string; patch?: Record<string, unknown> },
    user: CurrentUser,
  ): Promise<{ action: string; args: Record<string, unknown>; preview: Preview }> {
    return this.gateway.refresh(input, user)
  }

  cancel(token: string, user: CurrentUser): Promise<{ ok: true }> {
    return this.gateway.cancel(token, user)
  }

  records(limit: number) {
    return this.audit.recent(limit)
  }

  /** 待人工审核的草稿凭证（只读，供记账台展示与审核动作挑选） */
  async pendingVouchers(limit: number) {
    const take = Math.min(Math.max(limit, 1), 50)
    const [rows, total] = await this.voucherRepo.findAndCount({
      where: { status: VoucherStatus.DRAFT } as any,
      order: { period: 'DESC', voucherNo: 'ASC' } as any,
      take,
    })
    return {
      total,
      items: (rows as Voucher[]).map((voucher) => ({
        id: voucher.id,
        no: `${voucher.word}-${String(voucher.voucherNo).padStart(4, '0')}`,
        date: String(voucher.voucherDate),
        amount: Number(voucher.debitTotal ?? 0),
        remark: voucher.remark ?? '',
      })),
    }
  }
}
