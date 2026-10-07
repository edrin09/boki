import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Voucher } from '../../entities/voucher.entity'
import { VoucherEntry } from '../../entities/voucher-entry.entity'
import { Account } from '../../entities/account.entity'
import { Partner } from '../../entities/partner.entity'
import { Department } from '../../entities/department.entity'
import { Project } from '../../entities/project.entity'
import { VouchersService } from './vouchers.service'
import { VouchersController } from './vouchers.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Voucher,
      VoucherEntry,
      Account,
      Partner,
      Department,
      Project,
    ]),
  ],
  controllers: [VouchersController],
  providers: [VouchersService],
  exports: [VouchersService],
})
export class VouchersModule {}