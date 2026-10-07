import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { WriteOff } from '../../entities/business.entity'
import { Account } from '../../entities/account.entity'
import { BankAccount } from '../../entities/bank-account.entity'
import { Partner } from '../../entities/partner.entity'
import { Voucher } from '../../entities/voucher.entity'
import { BooksModule } from '../books/books.module'
import { VouchersModule } from '../vouchers/vouchers.module'
import { ArApService } from './ar-ap.service'
import { ArApController } from './ar-ap.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([WriteOff, Account, BankAccount, Partner, Voucher]),
    BooksModule,
    VouchersModule,
  ],
  controllers: [ArApController],
  providers: [ArApService],
  exports: [ArApService],
})
export class ArApModule {}