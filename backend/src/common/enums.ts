/**
 * 公共枚举定义
 */

/** 会计科目类别（对应一级科目大类） */
export enum AccountCategory {
  ASSET = 'asset', // 资产
  LIABILITY = 'liability', // 负债
  EQUITY = 'equity', // 所有者权益
  COST = 'cost', // 成本
  PROFIT = 'profit', // 损益
}

/** 余额方向 */
export enum BalanceDirection {
  DEBIT = 'debit', // 借方
  CREDIT = 'credit', // 贷方
}

/** 凭证状态 */
export enum VoucherStatus {
  DRAFT = 'draft', // 草稿（未审核）
  APPROVED = 'approved', // 已审核
  CANCELLED = 'cancelled', // 已作废
}

/** 单据来源 */

/** 凭证字 */
export enum VoucherWord {
  GENERAl = '记', // 记账凭证
  CASH = '现', // 现金
  BANK = '银', // 银行
  TRANSFER = '转', // 转账
}

/** 往来单位类型 */
export enum PartnerType {
  CUSTOMER = 'customer', // 客户
  SUPPLIER = 'supplier', // 供应商
  BOTH = 'both', // 客户兼供应商
}

/** 资金账户类型 */
export enum BankAccountType {
  CASH = 'cash', // 现金
  BANK = 'bank', // 银行
}

/** 辅助核算维度 */
export enum AuxiliaryType {
  PARTNER = 'partner', // 往来单位
  DEPARTMENT = 'department', // 部门
  PROJECT = 'project', // 项目
}

/** 单据业务类型 */
export enum CashBankBizType {
  RECEIPT = 'receipt', // 收款
  PAYMENT = 'payment', // 付款
  TRANSFER = 'transfer', // 转账
  EXPENSE = 'expense', // 费用报销
  INCOME = 'income', // 收入
}

export enum IncomeExpenseBizType {
  INCOME = 'income', // 收入
  EXPENSE = 'expense', // 支出
}

/** 权限类型 */
export enum PermissionType {
  MENU = 'menu', // 菜单/页面
  ACTION = 'action', // 操作按钮
}

/** 启用状态 */
export enum EnableStatus {
  DISABLED = 0,
  ENABLED = 1,
}

/** 用户状态 */
export enum UserStatus {
  DISABLED = 0,
  ENABLED = 1,
}

/** 往来核销类型 */
export enum WriteOffType {
  RECEIVABLE = 'receivable', // 应收核销（收款）
  PAYABLE = 'payable', // 应付核销（付款）
}

/** 员工性别 */
export enum EmployeeGender {
  MALE = 'male',
  FEMALE = 'female',
  UNKNOWN = 'unknown',
}

/** 员工状态 */
export enum EmployeeStatus {
  LEFT = 0, // 离职
  ON_JOB = 1, // 在职
}

/** 报销单状态 */
export enum ExpenseClaimStatus {
  DRAFT = 'draft', // 草稿
  APPROVED = 'approved', // 已审核（费用已入账）
  PAID = 'paid', // 已付款
  REJECTED = 'rejected', // 已驳回
}

/** 报销支付方式 */
export enum ExpensePayMethod {
  ADVANCE = 'advance', // 员工垫付（贷：其他应收款-员工）
  CASH = 'cash', // 现金支付（贷：库存现金）
  BANK = 'bank', // 银行支付（贷：银行存款）
}

/** 工资单状态 */
export enum PayrollStatus {
  DRAFT = 'draft', // 草稿
  APPROVED = 'approved', // 已审核（已计提）
  PAID = 'paid', // 已发放
}

/** 借款单状态 */
export enum LoanStatus {
  DRAFT = 'draft', // 草稿
  APPROVED = 'approved', // 已借款（款项已发放）
  REPAID = 'repaid', // 已还款
  REJECTED = 'rejected', // 已驳回
}

/** 借款/还款方式 */
export enum LoanPayMethod {
  CASH = 'cash', // 现金
  BANK = 'bank', // 银行转账
}

/** 纳税人类型：决定增值税申报口径（小规模征收率 / 一般纳税人分税率） */
export enum TaxpayerType {
  SMALL_SCALE = 'small_scale', // 小规模纳税人
  GENERAL = 'general', // 一般纳税人
}

/** 票据类型 */
export enum ReceiptType {
  INVOICE = 'invoice', // 增值税发票
  ID_CARD = 'id_card', // 身份证
  BUSINESS_LICENSE = 'business_license', // 营业执照
  TRAIN_TICKET = 'train_ticket', // 火车票/行程单
  RECEIPT = 'receipt', // 通用收据
  PAYROLL = 'payroll', // 工资表/工资单
  BANK_STATEMENT = 'bank_statement', // 银行对账单/流水/回单
  EXPENSE_CLAIM = 'expense_claim', // 报销单
  UNKNOWN = 'unknown', // 未识别
}

/** 票据识别状态 */
export enum ReceiptStatus {
  PARSED = 'parsed', // 已解析（未生成草稿）
  DRAFTED = 'drafted', // 已生成凭证草稿（待确认）
  CONFIRMED = 'confirmed', // 已确认入账
  REJECTED = 'rejected', // 已驳回（不生成凭证）
  DUPLICATE = 'duplicate', // 重复文件（未入库）
  FAILED = 'failed', // 解析失败
}

/** 单据来源 */
export enum VoucherSource {
  MANUAL = 'manual',
  CASH_BANK = 'cash_bank',
  AR_AP = 'ar_ap',
  INCOME_EXPENSE = 'income_expense',
  EXPENSE_CLAIM = 'expense_claim',
  PAYROLL = 'payroll',
  LOAN = 'loan',
}

/** 系统参数键 */
export const SYS_CONFIG_KEYS = {
  FISCAL_START_DATE: 'fiscal_start_date', // 账期起始日期
  COMPANY_NAME: 'company_name', // 公司名称
  COMPANY_TAX_NO: 'company_tax_no', // 纳税人识别号
} as const