import { Module } from '@nestjs/common'
import { CashBankModule } from './modules/cash-bank/cash-bank.module'
import { BankStmtModule } from './modules/bank-stmt/bank-stmt.module'

@Module({
  imports: [CashBankModule, BankStmtModule],
})
export class CashBankPluginModule {}

export const module = CashBankPluginModule

// 迁移过渡期：CashFlow / BankStmtRow 仍由内核实体注册。
export const entities = []
