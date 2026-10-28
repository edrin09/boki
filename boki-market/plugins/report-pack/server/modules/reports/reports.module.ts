import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Account } from '@core/entities/account.entity'
import { Voucher } from '@core/entities/voucher.entity'
import { VoucherEntry } from '@core/entities/voucher-entry.entity'
import { Receipt } from '@core/entities/receipt.entity'
import { Partner } from '@core/entities/partner.entity'
import { Payroll, ExpenseClaim } from '@core/entities/hr.entity'
import { FixedExpense, FixedExpenseLog } from '@core/entities/fixed-expense.entity'
import { BooksModule } from '@core/modules/books/books.module'
import { companyRepoProviders } from '@core/common/company/company-repo.decorator'
import { ReportsService } from './reports.service'
import { AnalysisService } from './analysis.service'
import { ReportsController } from './reports.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Account,
      Voucher,
      VoucherEntry,
      Receipt,
      Partner,
      Payroll,
      ExpenseClaim,
      FixedExpense,
      FixedExpenseLog,
    ]),
    BooksModule,
  ],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    AnalysisService,
    ...companyRepoProviders(
      Account,
      Voucher,
      VoucherEntry,
      Receipt,
      Partner,
      Payroll,
      ExpenseClaim,
      FixedExpense,
      FixedExpenseLog,
    ),
  ],
  exports: [ReportsService, AnalysisService],
})
export class ReportsModule {}
