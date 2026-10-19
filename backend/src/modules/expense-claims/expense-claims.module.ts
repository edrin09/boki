import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ExpenseClaim, ExpenseClaimItem } from '../../entities/hr.entity'
import { Employee } from '../../entities/hr.entity'
import { Department } from '../../entities/department.entity'
import { Account } from '../../entities/account.entity'
import { BankAccount } from '../../entities/bank-account.entity'
import { Voucher } from '../../entities/voucher.entity'
import { VouchersModule } from '../vouchers/vouchers.module'
import { LoansModule } from '../loans/loans.module'
import { ExpenseClaimsService } from './expense-claims.service'
import { ExpenseClaimsImportService } from './expense-claims-import.service'
import { HrDocPdfService } from '../../common/pdf/hr-doc-pdf.service'
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
  providers: [ExpenseClaimsService, ExpenseClaimsImportService, HrDocPdfService],
  exports: [ExpenseClaimsService],
})
export class ExpenseClaimsModule {}