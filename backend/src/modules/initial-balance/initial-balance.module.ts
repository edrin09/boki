import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { InitialBalance } from '../../entities/initial-balance.entity'
import { Account } from '../../entities/account.entity'
import { Partner } from '../../entities/partner.entity'
import { Department } from '../../entities/department.entity'
import { Project } from '../../entities/project.entity'
import { InitialBalanceService } from './initial-balance.service'
import { InitialBalanceController } from './initial-balance.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InitialBalance,
      Account,
      Partner,
      Department,
      Project,
    ]),
  ],
  controllers: [InitialBalanceController],
  providers: [InitialBalanceService],
  exports: [InitialBalanceService],
})
export class InitialBalanceModule {}