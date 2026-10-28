import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ExpenseClaim, ExpenseClaimItem } from '@core/entities/hr.entity'
import { Employee } from '@core/entities/hr.entity'
import { Department } from '@core/entities/department.entity'
import { Account } from '@core/entities/account.entity'
import { BankAccount } from '@core/entities/bank-account.entity'
import { Voucher } from '@core/entities/voucher.entity'
import { VouchersModule } from '@core/modules/vouchers/vouchers.module'
import { companyRepoProviders } from '@core/common/company/company-repo.decorator'
import { LoansModule } from '../loans/loans.module'
import { ExpenseClaimsService } from './expense-claims.service'
import { ExpenseClaimsImportService } from './expense-claims-import.service'
import { HrDocPdfService } from '@core/common/pdf/hr-doc-pdf.service'
import { ExpenseClaimsController } from './expense-claims.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExpenseClaim,
      ExpenseClaimItem,
      Employee,
      Department,
      Account,
      BankAccount,
      Voucher,
    ]),
    VouchersModule,
    LoansModule,
  ],
  controllers: [ExpenseClaimsController],
  providers: [
    ExpenseClaimsService,
    ExpenseClaimsImportService,
    HrDocPdfService,
    ...companyRepoProviders(
      ExpenseClaim,
      ExpenseClaimItem,
      Employee,
      Department,
      Account,
      BankAccount,
      Voucher,
    ),
  ],
  exports: [ExpenseClaimsService],
})
export class ExpenseClaimsModule {}