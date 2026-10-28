import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Company } from '@core/entities/company.entity'
import { UserCompany } from '@core/entities/user-company.entity'
import { User } from '@core/entities/user.entity'
import { Role } from '@core/entities/role.entity'
import { Account } from '@core/entities/account.entity'
import { Voucher } from '@core/entities/voucher.entity'
import { VoucherEntry } from '@core/entities/voucher-entry.entity'
import { CompaniesController } from './companies.controller'
import { CompaniesService } from './companies.service'

/**
 * 记账公司管理模块。
 *
 * 只接管公司档案的管理面（列表 / 新建 / 编辑 / 删除 / 成员授权）。
 * 公司上下文（JWT companyId）、CompanyScopeInterceptor、登录与权限判定
 * 仍在内核；`sys_company` / `sys_user_company` 也属于内核保留 schema，
 * 因此本插件 entities 为空，卸载插件不会删表。
 */
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
})
export class CompaniesModule {}
