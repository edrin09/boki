import { Global, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Company } from '../../entities/company.entity'
import { UserCompany } from '../../entities/user-company.entity'
import { User } from '../../entities/user.entity'
import { Role } from '../../entities/role.entity'
import { Account } from '../../entities/account.entity'
import { Voucher } from '../../entities/voucher.entity'
import { VoucherEntry } from '../../entities/voucher-entry.entity'
import { CompaniesController } from './companies.controller'
import { CompaniesService } from './companies.service'

/**
 * 记账公司模块。
 *
 * 设为 @Global：多公司能力是横切关注点，CompanyScopeInterceptor、
 * AuthService 等其他模块都要注入 CompaniesService。
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      UserCompany,
      User,
      Role,
      Account,
      Voucher,
      VoucherEntry,
    ]),
  ],
  controllers: [CompaniesController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}