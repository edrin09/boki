import { Global, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SysLog } from '../../entities/sys-log.entity'
import { User } from '../../entities/user.entity'
import { Account } from '../../entities/account.entity'
import { Voucher } from '../../entities/voucher.entity'
import { VoucherEntry } from '../../entities/voucher-entry.entity'
import { SysConfig } from '../../entities/sys-config.entity'
import { Company } from '../../entities/company.entity'
import { SystemService } from './system.service'
import { SystemController } from './system.controller'

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([SysLog, User, Account, Voucher, VoucherEntry, SysConfig, Company]),
  ],
  controllers: [SystemController],
  providers: [SystemService],
  exports: [SystemService],
})
export class SystemModule {}