import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Department } from '../../entities/department.entity'
import { VoucherEntry } from '../../entities/voucher-entry.entity'
import { InitialBalance } from '../../entities/initial-balance.entity'
import { DepartmentsService } from './departments.service'
import { DepartmentsController } from './departments.controller'

@Module({
  imports: [TypeOrmModule.forFeature([Department, VoucherEntry, InitialBalance])],
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
  exports: [DepartmentsService],
})
export class DepartmentsModule {}