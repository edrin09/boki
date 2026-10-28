import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BankStmtRow } from '@core/entities/business.entity'
import { Account } from '@core/entities/account.entity'
import { BankAccount } from '@core/entities/bank-account.entity'
import { Partner } from '@core/entities/partner.entity'
import { Loan, Employee } from '@core/entities/hr.entity'
import { companyRepoProviders } from '@core/common/company/company-repo.decorator'
import { BankStmtController } from './bank-stmt.controller'
import { BankStmtService } from './bank-stmt.service'
import { CashBankModule } from '../cash-bank/cash-bank.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([BankStmtRow, Account, BankAccount, Partner, Loan, Employee]),
    CashBankModule,
  ],
  controllers: [BankStmtController],
  providers: [
    BankStmtService,
    ...companyRepoProviders(BankStmtRow, Account, BankAccount, Partner, Loan, Employee),
  ],
})
export class BankStmtModule {}
