import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Receipt } from '@core/entities/receipt.entity'
import { ClassifyRule } from '@core/entities/classify-rule.entity'
import { Partner } from '@core/entities/partner.entity'
import { Account } from '@core/entities/account.entity'
import { Department } from '@core/entities/department.entity'
import { Voucher } from '@core/entities/voucher.entity'
import { VoucherEntry } from '@core/entities/voucher-entry.entity'
import { Employee, Loan } from '@core/entities/hr.entity'
import { OcrSupportModule } from '@plugin/ocr/server/modules/ocr/ocr-support.module'
import { VouchersModule } from '@core/modules/vouchers/vouchers.module'
import { companyRepoProviders } from '@core/common/company/company-repo.decorator'
import { LoansModule } from '@plugin/hr/server/modules/loans/loans.module'
import { ExpenseClaimsModule } from '@plugin/hr/server/modules/expense-claims/expense-claims.module'
import { ReceiptsController } from './receipts.controller'
import { ReceiptsService } from './receipts.service'
import { ClassifyService } from './classify.service'
import { ClassifyRulesService } from './classify-rules.service'
import { ReceiptWorkbenchService } from './workbench.service'
import { PartySyncService } from './party-sync.service'
import { AiVoiceModule } from '../voice-ops/ai-voice.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Receipt,
      ClassifyRule,
      Partner,
      Account,
      Department,
      Voucher,
      VoucherEntry,
      Employee,
      Loan,
    ]),
    OcrSupportModule,
    VouchersModule,
    LoansModule,
    ExpenseClaimsModule,
    // 语音一句话记账（凭证增改审 / 员工建档 / 发工资）也归本插件：
    // 和票据上传共用同一套「AI 解析 → 草稿 → 人工确认」链路。
    AiVoiceModule,
  ],
  controllers: [ReceiptsController],
  providers: [
    ReceiptsService,
    ClassifyService,
    ClassifyRulesService,
    ReceiptWorkbenchService,
    PartySyncService,
    ...companyRepoProviders(
      Receipt,
      ClassifyRule,
      Partner,
      Account,
      Department,
      Voucher,
      VoucherEntry,
      Employee,
      Loan,
    ),
  ],
  exports: [ReceiptsService, ClassifyService],
})
export class ReceiptsModule {}