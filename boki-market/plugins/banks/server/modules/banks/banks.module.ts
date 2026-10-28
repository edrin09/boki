import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BankAccount } from '@core/entities/bank-account.entity'
import { Account } from '@core/entities/account.entity'
import { companyRepoProviders } from '@core/common/company/company-repo.decorator'
import { BanksService } from './banks.service'
import { BanksController } from './banks.controller'

@Module({
  imports: [TypeOrmModule.forFeature([BankAccount, Account])],
  controllers: [BanksController],
  providers: [BanksService, ...companyRepoProviders(BankAccount, Account)],
  exports: [BanksService],
})
export class BanksModule {}