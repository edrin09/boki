import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Employee, ExpenseClaim, PayrollItem } from '../../entities/hr.entity'
import { Department } from '../../entities/department.entity'
import { EmployeesService } from './employees.service'
import { EmployeesController } from './employees.controller'

@Module({
  imports: [TypeOrmModule.forFeature([Employee, Department, ExpenseClaim, PayrollItem])],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}