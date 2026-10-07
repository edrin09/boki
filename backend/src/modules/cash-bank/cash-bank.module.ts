import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CashFlow } from '../../entities/business.entity'
import { Account } from '../../entities/account.entity'
import { BankAccount } from '../../entities/bank-account.entity'
import { Voucher } from '../../entities/voucher.entity'
import { VouchersModule } from '../vouchers/vouchers.module'
import { CashBankService } from './cash-bank.service'
import { CashBankController } from './cash-bank.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([CashFlow, Account, BankAccount, Voucher]),
    VouchersModule,
  ],
  controllers: [CashBankController],
  providers: [CashBankService],
  exports: [CashBankService],
})
export class CashBankModule {}