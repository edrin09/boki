import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Payroll, PayrollItem, Employee } from '../../entities/hr.entity'
import { Department } from '../../entities/department.entity'
import { Account } from '../../entities/account.entity'
import { BankAccount } from '../../entities/bank-account.entity'
import { Voucher } from '../../entities/voucher.entity'
import { VouchersModule } from '../vouchers/vouchers.module'
import { ReceiptsModule } from '../receipts/receipts.module'
import { LoansModule } from '../loans/loans.module'
import { PayrollService } from './payroll.service'
import { PayrollImportService } from './payroll-import.service'
import { HrDocPdfService } from '../../common/pdf/hr-doc-pdf.service'
import { PayrollController } from './payroll.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Payroll,
      PayrollItem,
      Employee,
      Department,
      Account,
      BankAccount,
      Voucher,
    ]),
    VouchersModule,
    ReceiptsModule,
    LoansModule,
  ],
  controllers: [PayrollController],
  providers: [PayrollService, PayrollImportService, HrDocPdfService],
  exports: [PayrollService],
})
export class PayrollModule {}