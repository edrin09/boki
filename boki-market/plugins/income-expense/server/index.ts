import { Module } from '@nestjs/common'
import { IncomeExpenseModule } from './modules/income-expense/income-expense.module'
import { FixedExpenseModule } from './modules/fixed-expense/fixed-expense.module'

@Module({
  imports: [IncomeExpenseModule, FixedExpenseModule],
})
export class IncomeExpensePluginModule {}

export const module = IncomeExpensePluginModule

// 迁移过渡期：IncomeExpense / FixedExpense* 由内核实体注册，迁完实体后再改为对应实体数组。
export const entities = []
