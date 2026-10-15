import { Module } from '@nestjs/common'
import { BankStmtController } from './bank-stmt.controller'
import { BankStmtService } from './bank-stmt.service'
import { CompanyReposModule } from '../../common/company/company-repos.module'
import { CashBankModule } from '../cash-bank/cash-bank.module'

@Module({
  imports: [CompanyReposModule, CashBankModule],
  controllers: [BankStmtController],
  providers: [BankStmtService],
})
export class BankStmtModule {}
