import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Account } from '../../entities/account.entity'
import { Voucher } from '../../entities/voucher.entity'
import { VoucherEntry } from '../../entities/voucher-entry.entity'
import { Receipt } from '../../entities/receipt.entity'
import { Partner } from '../../entities/partner.entity'
import { Payroll, ExpenseClaim } from '../../entities/hr.entity'
import { BooksModule } from '../books/books.module'
import { FixedExpenseModule } from '../fixed-expense/fixed-expense.module'
import { ReportsService } from './reports.service'
import { AnalysisService } from './analysis.service'
import { ReportsController } from './reports.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([Account, Voucher, VoucherEntry, Receipt, Partner, Payroll, ExpenseClaim]),
    BooksModule,
    FixedExpenseModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService, AnalysisService],
  exports: [ReportsService, AnalysisService],
})
export class ReportsModule {}
