import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { IncomeExpense } from '@core/entities/business.entity'
import { Account } from '@core/entities/account.entity'
import { BankAccount } from '@core/entities/bank-account.entity'
import { Voucher } from '@core/entities/voucher.entity'
import { companyRepoProviders } from '@core/common/company/company-repo.decorator'
import { VouchersModule } from '@core/modules/vouchers/vouchers.module'
import { IncomeExpenseService } from './income-expense.service'
import { IncomeExpenseController } from './income-expense.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([IncomeExpense, Account, BankAccount, Voucher]),
    VouchersModule,
  ],
  controllers: [IncomeExpenseController],
  providers: [
    IncomeExpenseService,
    ...companyRepoProviders(IncomeExpense, Account, BankAccount, Voucher),
  ],
  exports: [IncomeExpenseService],
})
export class IncomeExpenseModule {}
