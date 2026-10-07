import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BankAccount } from '../../entities/bank-account.entity'
import { Account } from '../../entities/account.entity'
import { BanksService } from './banks.service'
import { BanksController } from './banks.controller'

@Module({
  imports: [TypeOrmModule.forFeature([BankAccount, Account])],
  controllers: [BanksController],
  providers: [BanksService],
  exports: [BanksService],
})
export class BanksModule {}