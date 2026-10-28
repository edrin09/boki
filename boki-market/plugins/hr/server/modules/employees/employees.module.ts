import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Employee, ExpenseClaim, PayrollItem, Loan, EmployeeSettlement } from '@core/entities/hr.entity'
import { Department } from '@core/entities/department.entity'
import { companyRepoProviders } from '@core/common/company/company-repo.decorator'
import { EmployeesService } from './employees.service'
import { EmployeesImportService } from './employees-import.service'
import { EmployeesController } from './employees.controller'
import { LoansModule } from '../loans/loans.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([Employee, Department, ExpenseClaim, PayrollItem, Loan, EmployeeSettlement]),
    // 复用员工往来核销服务（欠款余额汇总 / 核销流水查询）
    LoansModule,
  ],
  controllers: [EmployeesController],
  providers: [
    EmployeesService,
    EmployeesImportService,
    ...companyRepoProviders(
      Employee,
      Department,
      ExpenseClaim,
      PayrollItem,
      Loan,
      EmployeeSettlement,
    ),
  ],
  exports: [EmployeesService],
})
export class EmployeesModule {}