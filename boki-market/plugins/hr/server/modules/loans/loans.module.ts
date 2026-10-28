import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Loan, Employee } from '@core/entities/hr.entity'
import { EmployeeSettlement } from '@core/entities/hr.entity'
import { Department } from '@core/entities/department.entity'
import { Account } from '@core/entities/account.entity'
import { BankAccount } from '@core/entities/bank-account.entity'
import { Voucher } from '@core/entities/voucher.entity'
import { VouchersModule } from '@core/modules/vouchers/vouchers.module'
import { companyRepoProviders } from '@core/common/company/company-repo.decorator'
import { LoansService } from './loans.service'
import { LoansImportService } from './loans-import.service'
import { HrDocPdfService } from '@core/common/pdf/hr-doc-pdf.service'
import { EmployeeSettlementService } from './employee-settlement.service'
import { LoansController } from './loans.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Loan,
      Employee,
      Department,
      Account,
      BankAccount,
      Voucher,
      EmployeeSettlement,
    ]),
    VouchersModule,
  ],
  controllers: [LoansController],
  providers: [
    LoansService,
    LoansImportService,
    EmployeeSettlementService,
    HrDocPdfService,
    ...companyRepoProviders(
      Loan,
      Employee,
      EmployeeSettlement,
      Department,
      Account,
      BankAccount,
      Voucher,
    ),
  ],
  exports: [LoansService, EmployeeSettlementService],
})
export class LoansModule {}
