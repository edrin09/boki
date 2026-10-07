import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Account } from '../../entities/account.entity'
import { Voucher } from '../../entities/voucher.entity'
import { VoucherEntry } from '../../entities/voucher-entry.entity'
import { InitialBalance } from '../../entities/initial-balance.entity'
import { Partner } from '../../entities/partner.entity'
import { Department } from '../../entities/department.entity'
import { Project } from '../../entities/project.entity'
import { BooksService } from './books.service'
import { BooksController } from './books.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Account,
      Voucher,
      VoucherEntry,
      InitialBalance,
      Partner,
      Department,
      Project,
    ]),
  ],
  controllers: [BooksController],
  providers: [BooksService],
  exports: [BooksService],
})
export class BooksModule {}