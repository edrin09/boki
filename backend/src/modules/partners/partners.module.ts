import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Partner } from '../../entities/partner.entity'
import { VoucherEntry } from '../../entities/voucher-entry.entity'
import { InitialBalance } from '../../entities/initial-balance.entity'
import { PartnersService } from './partners.service'
import { PartnersController } from './partners.controller'

@Module({
  imports: [TypeOrmModule.forFeature([Partner, VoucherEntry, InitialBalance])],
  controllers: [PartnersController],
  providers: [PartnersService],
  exports: [PartnersService],
})
export class PartnersModule {}