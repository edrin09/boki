import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Payroll, PayrollItem, Employee } from '../../entities/hr.entity'
import { Department } from '../../entities/department.entity'
import { Account } from '../../entities/account.entity'
import { BankAccount } from '../../entities/bank-account.entity'
import { Voucher } from '../../entities/voucher.entity'
import { VouchersModule } from '../vouchers/vouchers.module'
import { ReceiptsModule } from '../receipts/receipts.module'
import { PayrollService } from './payroll.service'
import { PayrollImportService } from './payroll-import.service'
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
  ],
  controllers: [PayrollController],
  providers: [PayrollService, PayrollImportService],
  exports: [PayrollService],
})
export class PayrollModule {}