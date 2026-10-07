import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Account } from '../../entities/account.entity'
import { VoucherEntry } from '../../entities/voucher-entry.entity'
import { InitialBalance } from '../../entities/initial-balance.entity'
import { BankAccount } from '../../entities/bank-account.entity'
import { AccountsService } from './accounts.service'
import { AccountsController } from './accounts.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([Account, VoucherEntry, InitialBalance, BankAccount]),
  ],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}