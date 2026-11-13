import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Account } from '../../entities/account.entity'
import { Voucher } from '../../entities/voucher.entity'
import { VoucherEntry } from '../../entities/voucher-entry.entity'
import { Partner } from '../../entities/partner.entity'
import { Department } from '../../entities/department.entity'
import { Project } from '../../entities/project.entity'
import { Employee } from '../../entities/hr.entity'
import { InitialBalance } from '../../entities/initial-balance.entity'
import { VouchersModule } from '../vouchers/vouchers.module'
import { InitialBalanceModule } from '../initial-balance/initial-balance.module'
import { ClosingService } from './closing.service'
import { ClosingController } from './closing.controller'

/**
 * 期末结转（内核功能，非插件）。
 *
 * 依赖 VouchersModule：结转凭证必须走凭证内核的统一校验（借贷平衡、明细科目、辅助核算），
 * 由 VouchersService 落库，避免另写一套记账逻辑。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Account,
      Voucher,
      VoucherEntry,
      Partner,
      Department,
      Project,
      Employee,
      InitialBalance,
    ]),
    VouchersModule,
    InitialBalanceModule,
  ],
  controllers: [ClosingController],
  providers: [ClosingService],
  exports: [ClosingService],
})
export class ClosingModule {}
