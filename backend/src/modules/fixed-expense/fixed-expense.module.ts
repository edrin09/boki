import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { FixedExpense, FixedExpenseLog } from '../../entities/fixed-expense.entity'
import { Account } from '../../entities/account.entity'
import { BankAccount } from '../../entities/bank-account.entity'
import { IncomeExpenseModule } from '../income-expense/income-expense.module'
import { FixedExpenseService } from './fixed-expense.service'
import { FixedExpenseController } from './fixed-expense.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([FixedExpense, FixedExpenseLog, Account, BankAccount]),
    IncomeExpenseModule,
  ],
  controllers: [FixedExpenseController],
  providers: [FixedExpenseService],
  exports: [FixedExpenseService],
})
export class FixedExpenseModule {}
