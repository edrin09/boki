import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { companyRepoProviders } from '@core/common/company/company-repo.decorator'
import { Voucher } from '@core/entities/voucher.entity'
import { VoucherEntry } from '@core/entities/voucher-entry.entity'
import { Account } from '@core/entities/account.entity'
import { Partner } from '@core/entities/partner.entity'
import { Department } from '@core/entities/department.entity'
import { BankAccount } from '@core/entities/bank-account.entity'
import { Employee, Payroll } from '@core/entities/hr.entity'
import { VouchersModule } from '@core/modules/vouchers/vouchers.module'
import { AiModule } from '@plugin/ai/server/modules/ai/ai.module'
import { HrPluginModule } from '@plugin/hr/server/modules/hr.module'
import { AiVoiceAudit } from './bridge/entities/ai-voice-audit.entity'
import { ActionRegistry } from './bridge/action.registry'
import { AuditService } from './bridge/audit.service'
import { CatalogService } from './bridge/catalog.service'
import { CompilerService } from './bridge/compiler.service'
import { GatewayService } from './bridge/gateway.service'
import { TokenStore } from './bridge/token.store'
import {
  VoucherApproveAction,
  VoucherCreateAction,
  VoucherModifyAction,
  VoucherSupport,
} from './actions/voucher.action'
import { EmployeeCreateAction } from './actions/employee.action'
import { PayrollRunAction } from './actions/payroll.action'
import { AiVoiceService } from './ai-voice.service'
import { AiVoiceController } from './ai-voice.controller'

/**
 * 语音一句话记账（AI 智能记账插件里的「语音通道」）。
 *
 * 依赖关系：
 * - ai：模型接入（OpenAI 兼容），硬依赖。
 * - hr：员工与工资服务（写入落点），硬依赖。
 * - voice：**可选依赖**。语音识别只走 HTTP/WS 契约（/api/voice/stream、
 *   /api/voice/transcribe），不 import 对方的 Nest 模块——同一模块类经不同
 *   父模块导入会生成两个模块实例，导致流式识别 WebSocket 被重复挂载。
 *   没装 voice 时本模块照常工作（文本指令），只是前端没有语音弹窗可挂载。
 *
 * 本模块自己只持有审计表 + 指令内核，不新增业务表。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiVoiceAudit,
      Voucher,
      VoucherEntry,
      Account,
      Partner,
      Department,
      BankAccount,
      Employee,
      Payroll,
    ]),
    VouchersModule,
    AiModule,
    HrPluginModule,
  ],
  controllers: [AiVoiceController],
  providers: [
    TokenStore,
    AuditService,
    CatalogService,
    ActionRegistry,
    CompilerService,
    GatewayService,
    AiVoiceService,
    VoucherSupport,
    VoucherCreateAction,
    VoucherModifyAction,
    VoucherApproveAction,
    EmployeeCreateAction,
    PayrollRunAction,
    ...companyRepoProviders(
      AiVoiceAudit,
      Voucher,
      VoucherEntry,
      Account,
      Partner,
      Department,
      BankAccount,
      Employee,
      Payroll,
    ),
  ],
  exports: [AiVoiceService],
})
export class AiVoiceModule {}
