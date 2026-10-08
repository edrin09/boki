import { Global, Module } from '@nestjs/common'
import { companyRepoProviders } from './company-repo.decorator'
import { Account } from '../../entities/account.entity'
import { BankAccount } from '../../entities/bank-account.entity'
import { Partner } from '../../entities/partner.entity'
import { Department } from '../../entities/department.entity'
import { Project } from '../../entities/project.entity'
import { InitialBalance } from '../../entities/initial-balance.entity'
import { Voucher } from '../../entities/voucher.entity'
import { VoucherEntry } from '../../entities/voucher-entry.entity'
import { CashFlow } from '../../entities/business.entity'
import { WriteOff } from '../../entities/business.entity'
import { IncomeExpense } from '../../entities/business.entity'
import { Employee } from '../../entities/hr.entity'
import { ExpenseClaim } from '../../entities/hr.entity'
import { ExpenseClaimItem } from '../../entities/hr.entity'
import { Payroll } from '../../entities/hr.entity'
import { PayrollItem } from '../../entities/hr.entity'
import { Receipt } from '../../entities/receipt.entity'
import { ClassifyRule } from '../../entities/classify-rule.entity'

/** 所有需要公司隔离的业务实体 */
export const COMPANY_SCOPED_ENTITIES = [
  Account,
  BankAccount,
  Partner,
  Department,
  Project,
  InitialBalance,
  Voucher,
  VoucherEntry,
  CashFlow,
  WriteOff,
  IncomeExpense,
  Employee,
  ExpenseClaim,
  ExpenseClaimItem,
  Payroll,
  PayrollItem,
  Receipt,
  ClassifyRule,
]

/**
 * 公司隔离仓储提供者集合。
 *
 * 设为 @Global 后各业务模块直接用 `@InjectCompanyRepo(Entity)` 注入，
 * 无需在每个模块里重复注册。
 * 注意：底层 Repository 仍需模块内 TypeOrmModule.forFeature 注册，
 * 但本模块的 provider 只依赖 DataSource，因此可全局共享。
 */
const providers = companyRepoProviders(...COMPANY_SCOPED_ENTITIES)

@Global()
@Module({
  providers,
  exports: providers.map((p: any) => p.provide),
})
export class CompanyReposModule {}