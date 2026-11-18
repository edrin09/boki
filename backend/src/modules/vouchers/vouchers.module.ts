import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Voucher } from '../../entities/voucher.entity'
import { VoucherEntry } from '../../entities/voucher-entry.entity'
import { Account } from '../../entities/account.entity'
import { Partner } from '../../entities/partner.entity'
import { Department } from '../../entities/department.entity'
import { Project } from '../../entities/project.entity'
import { CashFlow } from '../../entities/business.entity'
import { ExpenseClaim, Loan, Payroll, PayrollItem } from '../../entities/hr.entity'
import { BankAccount } from '../../entities/bank-account.entity'
import { VouchersService } from './vouchers.service'
import { VouchersController } from './vouchers.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Voucher,
      VoucherEntry,
      Account,
      Partner,
      Department,
      Project,
      CashFlow,
      BankAccount,
      Loan,
      ExpenseClaim,
      Payroll,
      PayrollItem,
    ]),
  ],
  controllers: [VouchersController],
  providers: [VouchersService],
  exports: [VouchersService],
})
export class VouchersModule {}