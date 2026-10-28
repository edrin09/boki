import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Department } from '@core/entities/department.entity'
import { VoucherEntry } from '@core/entities/voucher-entry.entity'
import { InitialBalance } from '@core/entities/initial-balance.entity'
import { companyRepoProviders } from '@core/common/company/company-repo.decorator'
import { DepartmentsService } from './departments.service'
import { DepartmentsController } from './departments.controller'

@Module({
  imports: [TypeOrmModule.forFeature([Department, VoucherEntry, InitialBalance])],
  controllers: [DepartmentsController],
  providers: [DepartmentsService, ...companyRepoProviders(Department, VoucherEntry, InitialBalance)],
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
