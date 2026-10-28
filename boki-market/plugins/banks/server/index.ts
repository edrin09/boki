import { BanksModule } from './modules/banks/banks.module'

export const module = BanksModule

// 迁移过渡期：BankAccount 仍由内核实体注册（其他内核/插件模块引用它）。
// 实体归属随最终批次迁入插件后，再改为 [BankAccount]。
export const entities = []

