import { Module } from '@nestjs/common'
import { EmployeesModule } from './employees/employees.module'
import { ExpenseClaimsModule } from './expense-claims/expense-claims.module'
import { LoansModule } from './loans/loans.module'
import { PayrollModule } from './payroll/payroll.module'

/**
 * 薪酬报销插件模块。
 *
 * 员工、报销、借款、工资四个子模块共享核销与凭证能力；
 * 工资导入复用 ocr 插件的文档解析服务。
 */
@Module({
  imports: [EmployeesModule, ExpenseClaimsModule, LoansModule, PayrollModule],
  exports: [EmployeesModule, ExpenseClaimsModule, LoansModule, PayrollModule],
})
export class HrPluginModule {}
