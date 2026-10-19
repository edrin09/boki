import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Voucher } from '../../entities/voucher.entity'
import { BankAccount } from '../../entities/bank-account.entity'
import { Account } from '../../entities/account.entity'
import { ReportsModule } from '../reports/reports.module'
import { BooksModule } from '../books/books.module'
import { ArApModule } from '../ar-ap/ar-ap.module'
import { LoansModule } from '../loans/loans.module'
import { ExpenseClaimsModule } from '../expense-claims/expense-claims.module'
import { AiModule } from '../ai/ai.module'
import { VoiceAssistantController } from './voice-assistant.controller'
import { VoiceAsrService } from './voice-asr.service'
import { VoiceQueryService } from './voice-query.service'
import { AiAgentService } from './ai-agent.service'

@Module({
  imports: [
    // 语音助手是“只读聚合”模块：复用现有查询服务（report/ar-ap/loans/expense-claims），
    // 不引入新数据的写入路径
    ReportsModule,
    BooksModule,
    ArApModule,
    LoansModule,
    ExpenseClaimsModule,
    AiModule,
    TypeOrmModule.forFeature([Voucher, BankAccount, Account]),
  ],
  controllers: [VoiceAssistantController],
  providers: [VoiceAsrService, VoiceQueryService, AiAgentService],
  exports: [VoiceQueryService],
})
export class VoiceAssistantModule {}
