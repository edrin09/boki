import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Payroll, PayrollItem, Employee } from '@core/entities/hr.entity'
import { Department } from '@core/entities/department.entity'
import { Account } from '@core/entities/account.entity'
import { BankAccount } from '@core/entities/bank-account.entity'
import { Voucher } from '@core/entities/voucher.entity'
import { VouchersModule } from '@core/modules/vouchers/vouchers.module'
import { companyRepoProviders } from '@core/common/company/company-repo.decorator'
import { OcrSupportModule } from '@plugin/ocr/server/modules/ocr/ocr-support.module'
import { LoansModule } from '../loans/loans.module'
import { PayrollService } from './payroll.service'
import { PayrollImportService } from './payroll-import.service'
import { HrDocPdfService } from '@core/common/pdf/hr-doc-pdf.service'
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
    OcrSupportModule,
    LoansModule,
  ],
  controllers: [PayrollController],
  providers: [
    PayrollService,
    PayrollImportService,
    HrDocPdfService,
    ...companyRepoProviders(
      Payroll,
      PayrollItem,
      Employee,
      Department,
      Account,
      BankAccount,
      Voucher,
    ),
  ],
  exports: [PayrollService],
})
export class PayrollModule {}