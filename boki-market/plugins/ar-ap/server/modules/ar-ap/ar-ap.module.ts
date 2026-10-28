import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { WriteOff } from '@core/entities/business.entity'
import { Account } from '@core/entities/account.entity'
import { BankAccount } from '@core/entities/bank-account.entity'
import { Partner } from '@core/entities/partner.entity'
import { Voucher } from '@core/entities/voucher.entity'
import { companyRepoProviders } from '@core/common/company/company-repo.decorator'
import { BooksModule } from '@core/modules/books/books.module'
import { VouchersModule } from '@core/modules/vouchers/vouchers.module'
import { ArApService } from './ar-ap.service'
import { ArApController } from './ar-ap.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([WriteOff, Account, BankAccount, Partner, Voucher]),
    BooksModule,
    VouchersModule,
  ],
  controllers: [ArApController],
  providers: [
    ArApService,
    ...companyRepoProviders(WriteOff, Account, BankAccount, Partner, Voucher),
  ],
  exports: [ArApService],
})
export class ArApModule {}
