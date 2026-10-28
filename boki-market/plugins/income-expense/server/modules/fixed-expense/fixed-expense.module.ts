import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { FixedExpense, FixedExpenseLog } from '@core/entities/fixed-expense.entity'
import { Account } from '@core/entities/account.entity'
import { BankAccount } from '@core/entities/bank-account.entity'
import { companyRepoProviders } from '@core/common/company/company-repo.decorator'
import { IncomeExpenseModule } from '../income-expense/income-expense.module'
import { FixedExpenseService } from './fixed-expense.service'
import { FixedExpenseController } from './fixed-expense.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([FixedExpense, FixedExpenseLog, Account, BankAccount]),
    IncomeExpenseModule,
  ],
  controllers: [FixedExpenseController],
  providers: [
    FixedExpenseService,
    ...companyRepoProviders(FixedExpense, FixedExpenseLog, Account, BankAccount),
  ],
  exports: [FixedExpenseService],
})
export class FixedExpenseModule {}
