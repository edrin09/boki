import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { IncomeExpense } from '../../entities/business.entity'
import { Account } from '../../entities/account.entity'
import { BankAccount } from '../../entities/bank-account.entity'
import { Voucher } from '../../entities/voucher.entity'
import { VouchersModule } from '../vouchers/vouchers.module'
import { IncomeExpenseService } from './income-expense.service'
import { IncomeExpenseController } from './income-expense.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([IncomeExpense, Account, BankAccount, Voucher]),
    VouchersModule,
  ],
  controllers: [IncomeExpenseController],
  providers: [IncomeExpenseService],
  exports: [IncomeExpenseService],
})
export class IncomeExpenseModule {}