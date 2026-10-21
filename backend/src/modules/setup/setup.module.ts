import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Company } from '../../entities/company.entity'
import { UserCompany } from '../../entities/user-company.entity'
import { Account } from '../../entities/account.entity'
import { SetupController } from './setup.controller'
import { SetupService } from './setup.service'

/**
 * 内核建账模块。
 *
 * 仅保留「创建首个记账公司」：公司上下文、登录、权限判定与建账能力
 * 不依赖任何插件；公司档案管理由 multi-company 插件接管。
 */
@Module({
  imports: [TypeOrmModule.forFeature([Company, UserCompany, Account])],
  controllers: [SetupController],
  providers: [SetupService],
})
export class SetupModule {}
