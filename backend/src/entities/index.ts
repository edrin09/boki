export * from './base.entity'
export * from './permission.entity'
export * from './role.entity'
export * from './user.entity'
export * from './company.entity'
export * from './user-company.entity'
export * from './account.entity'
export * from './partner.entity'
export * from './bank-account.entity'
export * from './department.entity'
export * from './project.entity'
export * from './initial-balance.entity'
export * from './voucher.entity'
export * from './voucher-entry.entity'
export * from './business.entity'
export * from './hr.entity'
export * from './receipt.entity'
export * from './sys-log.entity'
export * from './sys-config.entity'
export * from './classify-rule.entity'

import { Permission } from './permission.entity'
import { Role } from './role.entity'
import { User } from './user.entity'
import { Company } from './company.entity'
import { UserCompany } from './user-company.entity'
import { Account } from './account.entity'
import { Partner } from './partner.entity'
import { BankAccount } from './bank-account.entity'
import { Department } from './department.entity'
import { Project } from './project.entity'
import { InitialBalance } from './initial-balance.entity'
import { Voucher } from './voucher.entity'
import { VoucherEntry } from './voucher-entry.entity'
import { CashFlow, WriteOff, IncomeExpense, BankStmtRow } from './business.entity'
import {
  Employee,
  ExpenseClaim,
  ExpenseClaimItem,
  Loan,
  Payroll,
  PayrollItem,
} from './hr.entity'
import { SysLog } from './sys-log.entity'
import { Receipt } from './receipt.entity'
import { SysConfig } from './sys-config.entity'
import { ClassifyRule } from './classify-rule.entity'

/** 全部实体（供 TypeORM 加载） */
export const entities = [
  Permission,
  Role,
  User,
  Company,
  UserCompany,
  Account,
  Partner,
  BankAccount,
  Department,
  Project,
  InitialBalance,
  Voucher,
  VoucherEntry,
  CashFlow,
  WriteOff,
  IncomeExpense,
  BankStmtRow,
  Employee,
  ExpenseClaim,
  ExpenseClaimItem,
  Loan,
  Payroll,
  PayrollItem,
  Receipt,
  SysConfig,
  ClassifyRule,
  SysLog,
]