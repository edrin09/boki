import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Voucher } from '@core/entities/voucher.entity'
import { BankAccount } from '@core/entities/bank-account.entity'
import { Account } from '@core/entities/account.entity'
import { ExpenseClaim, Loan } from '@core/entities/hr.entity'
import { companyRepoProviders } from '@core/common/company/company-repo.decorator'
import { ReportsModule } from '@plugin/report-pack/server/modules/reports/reports.module'
import { BooksModule } from '@core/modules/books/books.module'
import { AiModule } from '@plugin/ai/server/modules/ai/ai.module'
import { VoiceAssistantController } from './voice-assistant.controller'
import { VoiceAsrService } from './voice-asr.service'
import { VoiceQueryService } from './voice-query.service'
import { VoiceStreamService } from './voice-stream.service'
import { AiAgentService } from './ai-agent.service'

@Module({
  imports: [
    // 语音助手是“只读聚合”模块：复用现有查询服务与只读仓储，
    // 不依赖 hr 插件，也不引入新数据的写入路径
    ReportsModule,
    BooksModule,
    AiModule,
    TypeOrmModule.forFeature([Voucher, BankAccount, Account, Loan, ExpenseClaim]),
  ],
  controllers: [VoiceAssistantController],
  providers: [
    VoiceAsrService,
    VoiceQueryService,
    VoiceStreamService,
    AiAgentService,
    ...companyRepoProviders(Voucher, BankAccount, Account, Loan, ExpenseClaim),
  ],
  exports: [VoiceQueryService],
})
export class VoiceAssistantModule {}
