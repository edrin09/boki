import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Loan, Employee } from '../../entities/hr.entity'
import { EmployeeSettlement } from '../../entities/hr.entity'
import { Department } from '../../entities/department.entity'
import { Account } from '../../entities/account.entity'
import { BankAccount } from '../../entities/bank-account.entity'
import { Voucher } from '../../entities/voucher.entity'
import { VouchersModule } from '../vouchers/vouchers.module'
import { LoansService } from './loans.service'
import { LoansImportService } from './loans-import.service'
import { HrDocPdfService } from '../../common/pdf/hr-doc-pdf.service'
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
  providers: [LoansService, LoansImportService, EmployeeSettlementService, HrDocPdfService],
  exports: [LoansService, EmployeeSettlementService],
})
export class LoansModule {}
