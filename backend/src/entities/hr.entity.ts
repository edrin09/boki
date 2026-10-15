import { Column, Entity, Index } from 'typeorm'
import { BaseEntity } from './base.entity'
import {
  EmployeeGender,
  EmployeeStatus,
  ExpenseClaimStatus,
  ExpensePayMethod,
  LoanPayMethod,
  LoanStatus,
  PayrollStatus,
} from '../common/enums'
import { decimalTransformer } from '../common/transformers/decimal.transformer'

/**
 * 员工档案
 */
@Entity('fin_employee')
@Index('uk_employee_code', ['companyId', 'code'], { unique: true })
export class Employee extends BaseEntity {
  @Index('idx_employee_company')
  @Column({ name: 'company_id', type: 'varchar', length: 36, default: '' })
  companyId: string

  @Column({ length: 30, comment: '工号' })
  code: string

  @Column({ length: 50, comment: '姓名' })
  name: string

  @Column({ length: 10, default: 'unknown', comment: '性别：male/female/unknown' })
  gender: EmployeeGender | string

  @Column({ name: 'department_id', type: 'varchar', nullable: true, comment: '所属部门' })
  departmentId: string | null

  @Column({ length: 50, nullable: true, comment: '岗位' })
  position: string | null

  @Column({ length: 30, nullable: true, comment: '身份证号' })
  idCard: string | null

  @Column({ length: 30, nullable: true })
  phone: string | null

  @Column({ length: 100, nullable: true })
  email: string | null

  @Column({ name: 'hire_date', type: 'date', nullable: true, comment: '入职日期' })
  hireDate: string | null

  @Column({ name: 'leave_date', type: 'date', nullable: true, comment: '离职日期' })
  leaveDate: string | null

  @Column({
    name: 'base_salary',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
    comment: '基本工资（月）',
  })
  baseSalary: number

  @Column({ name: 'bank_name', length: 100, nullable: true, comment: '开户行' })
  bankName: string | null

  @Column({ name: 'bank_account', length: 50, nullable: true, comment: '工资卡号' })
  bankAccount: string | null

  @Column({
    type: 'int',
    default: 1,
    comment: '状态：1 在职 / 0 离职',
  })
  status: EmployeeStatus | number

  @Column({ length: 200, nullable: true })
  remark: string | null
}

/**
 * 财务报销单（主表）
 */
@Entity('fin_expense_claim')
@Index('idx_claim_no', ['companyId', 'claimNo'], { unique: true })
export class ExpenseClaim extends BaseEntity {
  @Index('idx_claim_company')
  @Column({ name: 'company_id', type: 'varchar', length: 36, default: '' })
  companyId: string

  @Column({ name: 'claim_no', length: 30, comment: '报销单号' })
  claimNo: string

  @Column({ name: 'claim_date', type: 'date', comment: '报销日期' })
  claimDate: string

  @Column({ name: 'employee_id', type: 'varchar', comment: '报销人ID' })
  employeeId: string

  @Column({ name: 'employee_name', length: 50, comment: '报销人姓名快照' })
  employeeName: string

  @Column({ name: 'department_id', type: 'varchar', nullable: true })
  departmentId: string | null

  @Column({ name: 'department_name', length: 100, nullable: true })
  departmentName: string | null

  @Column({
    name: 'total_amount',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
    comment: '报销金额合计',
  })
  totalAmount: number

  @Column({
    length: 20,
    default: 'advance',
    comment: '支付方式：advance 员工垫付 / cash 现金 / bank 银行',
  })
  payMethod: ExpensePayMethod | string

  @Column({ length: 20, default: 'draft', comment: '状态：draft/approved/paid/rejected' })
  status: ExpenseClaimStatus | string

  @Column({ name: 'expense_account_id', type: 'varchar', nullable: true, comment: '费用科目ID' })
  expenseAccountId: string | null

  @Column({ name: 'expense_account_name', length: 100, nullable: true })
  expenseAccountName: string | null

  @Column({ name: 'bank_account_id', type: 'varchar', nullable: true, comment: '付款资金账户ID' })
  bankAccountId: string | null

  @Column({ name: 'bank_account_name', length: 100, nullable: true })
  bankAccountName: string | null

  /** 审核生成的记账凭证（费用报销） */
  @Column({ name: 'voucher_id', type: 'varchar', nullable: true, comment: '费用报销凭证ID' })
  voucherId: string | null

  /** 付款生成的记账凭证 */
  @Column({ name: 'pay_voucher_id', type: 'varchar', nullable: true, comment: '付款凭证ID' })
  payVoucherId: string | null

  @Column({ name: 'created_by', type: 'varchar', nullable: true })
  createdBy: string | null

  @Column({ name: 'created_by_name', length: 50, nullable: true })
  createdByName: string | null

  @Column({ name: 'approved_at', type: 'datetime', nullable: true })
  approvedAt: Date | null

  @Column({ name: 'paid_at', type: 'datetime', nullable: true })
  paidAt: Date | null

  @Column({ length: 200, nullable: true })
  remark: string | null
}

/**
 * 报销单明细（费用行）
 */
@Entity('fin_expense_claim_item')
@Index('idx_claim_item_claim', ['claimId'])
export class ExpenseClaimItem extends BaseEntity {
  @Index('idx_claim_item_company')
  @Column({ name: 'company_id', type: 'varchar', length: 36, default: '' })
  companyId: string

  @Column({ name: 'claim_id', type: 'varchar', comment: '报销单ID' })
  claimId: string

  @Column({ length: 200, default: '', comment: '费用说明' })
  summary: string

  @Column({ name: 'account_id', type: 'varchar', nullable: true, comment: '费用科目ID' })
  accountId: string | null

  @Column({ name: 'account_code', length: 20, nullable: true })
  accountCode: string | null

  @Column({ name: 'account_name', length: 100, nullable: true })
  accountName: string | null

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  amount: number

  @Column({ length: 200, nullable: true })
  remark: string | null

  @Column({ type: 'int', default: 0, comment: '行号' })
  sort: number
}

/**
 * 工资单（按月批量）
 */
@Entity('fin_payroll')
@Index('uk_payroll_period', ['companyId', 'period', 'status'], { unique: false })
export class Payroll extends BaseEntity {
  @Index('idx_payroll_company')
  @Column({ name: 'company_id', type: 'varchar', length: 36, default: '' })
  companyId: string

  @Column({ name: 'payroll_no', length: 30, comment: '工资单号' })
  payrollNo: string

  @Column({ type: 'int', comment: '工资期间 YYYYMM' })
  period: number

  @Column({ name: 'pay_date', type: 'date', comment: '发放日期' })
  payDate: string

  @Column({ type: 'int', default: 0, comment: '员工人数' })
  employeeCount: number

  @Column({
    name: 'total_gross',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
    comment: '应发工资合计',
  })
  totalGross: number

  @Column({
    name: 'total_insurance',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
    comment: '个人社保合计',
  })
  totalInsurance: number

  @Column({
    name: 'total_fund',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
    comment: '个人公积金合计',
  })
  totalFund: number

  @Column({
    name: 'total_tax',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
    comment: '个人所得税合计',
  })
  totalTax: number

  @Column({
    name: 'total_other_deduct',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
    comment: '其他代扣合计',
  })
  totalOtherDeduct: number

  @Column({
    name: 'total_net',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
    comment: '实发工资合计',
  })
  totalNet: number

  @Column({ length: 20, default: 'draft', comment: '状态：draft/approved/paid' })
  status: PayrollStatus | string

  /** 费用科目（计提工资用），默认 6602 管理费用 */
  @Column({ name: 'expense_account_id', type: 'varchar', nullable: true })
  expenseAccountId: string | null

  @Column({ name: 'expense_account_name', length: 100, nullable: true })
  expenseAccountName: string | null

  /** 应付职工薪酬-工资 科目 */
  @Column({ name: 'payable_account_id', type: 'varchar', nullable: true })
  payableAccountId: string | null

  @Column({ name: 'payable_account_name', length: 100, nullable: true })
  payableAccountName: string | null

  /** 其他应付款（代扣社保/公积金）科目 */
  @Column({ name: 'deduct_account_id', type: 'varchar', nullable: true })
  deductAccountId: string | null

  @Column({ name: 'deduct_account_name', length: 100, nullable: true })
  deductAccountName: string | null

  /** 应交税费-应交个人所得税 科目 */
  @Column({ name: 'tax_account_id', type: 'varchar', nullable: true })
  taxAccountId: string | null

  @Column({ name: 'tax_account_name', length: 100, nullable: true })
  taxAccountName: string | null

  /** 发放资金账户 */
  @Column({ name: 'bank_account_id', type: 'varchar', nullable: true })
  bankAccountId: string | null

  @Column({ name: 'bank_account_name', length: 100, nullable: true })
  bankAccountName: string | null

  /** 计提凭证 */
  @Column({ name: 'voucher_id', type: 'varchar', nullable: true })
  voucherId: string | null

  /** 发放凭证 */
  @Column({ name: 'pay_voucher_id', type: 'varchar', nullable: true })
  payVoucherId: string | null

  @Column({ name: 'created_by', type: 'varchar', nullable: true })
  createdBy: string | null

  @Column({ name: 'created_by_name', length: 50, nullable: true })
  createdByName: string | null

  @Column({ name: 'approved_at', type: 'datetime', nullable: true })
  approvedAt: Date | null

  @Column({ name: 'paid_at', type: 'datetime', nullable: true })
  paidAt: Date | null

  @Column({ length: 200, nullable: true })
  remark: string | null
}

/**
 * 工资单明细（按员工）
 */
@Entity('fin_payroll_item')
@Index('idx_payroll_item_payroll', ['payrollId'])
export class PayrollItem extends BaseEntity {
  @Index('idx_payroll_item_company')
  @Column({ name: 'company_id', type: 'varchar', length: 36, default: '' })
  companyId: string

  @Column({ name: 'payroll_id', type: 'varchar', comment: '工资单ID' })
  payrollId: string

  @Column({ name: 'employee_id', type: 'varchar', comment: '员工ID' })
  employeeId: string

  @Column({ name: 'employee_code', length: 30 })
  employeeCode: string

  @Column({ name: 'employee_name', length: 50 })
  employeeName: string

  @Column({ name: 'department_name', length: 100, nullable: true })
  departmentName: string | null

  @Column({
    name: 'base_salary',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
    comment: '基本工资',
  })
  baseSalary: number

  @Column({
    name: 'performance',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
    comment: '绩效工资',
  })
  performance: number

  @Column({
    name: 'allowance',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
    comment: '津贴补贴',
  })
  allowance: number

  @Column({
    name: 'overtime',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
    comment: '加班费',
  })
  overtime: number

  @Column({
    name: 'gross',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
    comment: '应发合计',
  })
  gross: number

  @Column({
    name: 'insurance_personal',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
    comment: '个人承担社保',
  })
  insurancePersonal: number

  @Column({
    name: 'fund_personal',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
    comment: '个人承担公积金',
  })
  fundPersonal: number

  @Column({
    name: 'tax',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
    comment: '个人所得税',
  })
  tax: number

  @Column({
    name: 'other_deduct',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
    comment: '其他代扣',
  })
  otherDeduct: number

  @Column({
    name: 'net',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
    comment: '实发合计',
  })
  net: number

  @Column({ length: 200, nullable: true })
  remark: string | null

  @Column({ type: 'int', default: 0, comment: '行号' })
  sort: number
}

/**
 * 员工借款单（备用金 / 差旅费借款等）
 *
 * 链路：草稿 → 审核（发放借款，生成借款凭证）→ 还款（生成还款凭证）
 * 借款凭证：借 其他应收款-员工借款 / 贷 库存现金或银行存款
 * 还款凭证：借 库存现金或银行存款 / 贷 其他应收款-员工借款
 */
@Entity('fin_loan')
@Index('uk_loan_no', ['companyId', 'loanNo'], { unique: true })
export class Loan extends BaseEntity {
  @Index('idx_loan_company')
  @Column({ name: 'company_id', type: 'varchar', length: 36, default: '' })
  companyId: string

  @Column({ name: 'loan_no', length: 30, comment: '借款单号' })
  loanNo: string

  @Column({ name: 'loan_date', type: 'date', comment: '借款日期' })
  loanDate: string

  @Column({ name: 'employee_id', type: 'varchar', comment: '借款人ID' })
  employeeId: string

  @Column({ name: 'employee_name', length: 50, comment: '借款人姓名快照' })
  employeeName: string

  @Column({ name: 'department_id', type: 'varchar', nullable: true })
  departmentId: string | null

  @Column({ name: 'department_name', length: 100, nullable: true })
  departmentName: string | null

  @Column({
    name: 'amount',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
    comment: '借款金额',
  })
  amount: number

  @Column({ length: 200, nullable: true, comment: '借款事由' })
  reason: string | null

  @Column({
    length: 20,
    default: 'cash',
    comment: '借款方式：cash 现金 / bank 银行',
  })
  payMethod: LoanPayMethod | string

  @Column({ name: 'bank_account_id', type: 'varchar', nullable: true, comment: '放款资金账户ID' })
  bankAccountId: string | null

  @Column({ name: 'bank_account_name', length: 100, nullable: true })
  bankAccountName: string | null

  @Column({ length: 20, default: 'draft', comment: '状态：draft/approved/repaid/rejected' })
  status: LoanStatus | string

  /** 审核生成的借款凭证 */
  @Column({ name: 'voucher_id', type: 'varchar', nullable: true, comment: '借款凭证ID' })
  voucherId: string | null

  /** 还款生成的还款凭证 */
  @Column({ name: 'repay_voucher_id', type: 'varchar', nullable: true, comment: '最近一次还款凭证ID' })
  repayVoucherId: string | null

  /** 已累计还款金额（支持部分还款） */
  @Column({ name: 'repaid_amount', type: 'decimal', precision: 18, scale: 2, default: 0, transformer: decimalTransformer, comment: '已累计还款金额' })
  repaidAmount: number

  @Column({ name: 'created_by', type: 'varchar', nullable: true })
  createdBy: string | null

  @Column({ name: 'created_by_name', length: 50, nullable: true })
  createdByName: string | null

  @Column({ name: 'approved_at', type: 'datetime', nullable: true })
  approvedAt: Date | null

  @Column({ name: 'repaid_at', type: 'datetime', nullable: true })
  repaidAt: Date | null

  @Column({ name: 'repay_date', type: 'date', nullable: true, comment: '实际还款日期' })
  repayDate: string | null

  @Column({ length: 200, nullable: true })
  remark: string | null
}