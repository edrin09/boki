import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CashFlow } from '@core/entities/business.entity'
import { Account } from '@core/entities/account.entity'
import { BankAccount } from '@core/entities/bank-account.entity'
import { Voucher } from '@core/entities/voucher.entity'
import { companyRepoProviders } from '@core/common/company/company-repo.decorator'
import { VouchersModule } from '@core/modules/vouchers/vouchers.module'
import { CashBankService } from './cash-bank.service'
import { CashBankController } from './cash-bank.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([CashFlow, Account, BankAccount, Voucher]),
    VouchersModule,
  ],
  controllers: [CashBankController],
  providers: [
    CashBankService,
    ...companyRepoProviders(CashFlow, Account, BankAccount, Voucher),
  ],
  exports: [CashBankService],
})
export class CashBankModule {}
