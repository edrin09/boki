"use strict";
/**
 * 公共枚举定义
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYS_CONFIG_KEYS = exports.VoucherSource = exports.ReceiptStatus = exports.ReceiptType = exports.TaxpayerType = exports.PayrollStatus = exports.ExpensePayMethod = exports.ExpenseClaimStatus = exports.EmployeeStatus = exports.EmployeeGender = exports.WriteOffType = exports.UserStatus = exports.EnableStatus = exports.PermissionType = exports.IncomeExpenseBizType = exports.CashBankBizType = exports.AuxiliaryType = exports.BankAccountType = exports.PartnerType = exports.VoucherWord = exports.VoucherStatus = exports.BalanceDirection = exports.AccountCategory = void 0;
/** 会计科目类别（对应一级科目大类） */
var AccountCategory;
(function (AccountCategory) {
    AccountCategory["ASSET"] = "asset";
    AccountCategory["LIABILITY"] = "liability";
    AccountCategory["EQUITY"] = "equity";
    AccountCategory["COST"] = "cost";
    AccountCategory["PROFIT"] = "profit";
})(AccountCategory || (exports.AccountCategory = AccountCategory = {}));
/** 余额方向 */
var BalanceDirection;
(function (BalanceDirection) {
    BalanceDirection["DEBIT"] = "debit";
    BalanceDirection["CREDIT"] = "credit";
})(BalanceDirection || (exports.BalanceDirection = BalanceDirection = {}));
/** 凭证状态 */
var VoucherStatus;
(function (VoucherStatus) {
    VoucherStatus["DRAFT"] = "draft";
    VoucherStatus["APPROVED"] = "approved";
    VoucherStatus["CANCELLED"] = "cancelled";
})(VoucherStatus || (exports.VoucherStatus = VoucherStatus = {}));
/** 单据来源 */
/** 凭证字 */
var VoucherWord;
(function (VoucherWord) {
    VoucherWord["GENERAl"] = "\u8BB0";
    VoucherWord["CASH"] = "\u73B0";
    VoucherWord["BANK"] = "\u94F6";
    VoucherWord["TRANSFER"] = "\u8F6C";
})(VoucherWord || (exports.VoucherWord = VoucherWord = {}));
/** 往来单位类型 */
var PartnerType;
(function (PartnerType) {
    PartnerType["CUSTOMER"] = "customer";
    PartnerType["SUPPLIER"] = "supplier";
    PartnerType["BOTH"] = "both";
})(PartnerType || (exports.PartnerType = PartnerType = {}));
/** 资金账户类型 */
var BankAccountType;
(function (BankAccountType) {
    BankAccountType["CASH"] = "cash";
    BankAccountType["BANK"] = "bank";
})(BankAccountType || (exports.BankAccountType = BankAccountType = {}));
/** 辅助核算维度 */
var AuxiliaryType;
(function (AuxiliaryType) {
    AuxiliaryType["PARTNER"] = "partner";
    AuxiliaryType["DEPARTMENT"] = "department";
    AuxiliaryType["PROJECT"] = "project";
})(AuxiliaryType || (exports.AuxiliaryType = AuxiliaryType = {}));
/** 单据业务类型 */
var CashBankBizType;
(function (CashBankBizType) {
    CashBankBizType["RECEIPT"] = "receipt";
    CashBankBizType["PAYMENT"] = "payment";
    CashBankBizType["TRANSFER"] = "transfer";
    CashBankBizType["EXPENSE"] = "expense";
    CashBankBizType["INCOME"] = "income";
})(CashBankBizType || (exports.CashBankBizType = CashBankBizType = {}));
var IncomeExpenseBizType;
(function (IncomeExpenseBizType) {
    IncomeExpenseBizType["INCOME"] = "income";
    IncomeExpenseBizType["EXPENSE"] = "expense";
})(IncomeExpenseBizType || (exports.IncomeExpenseBizType = IncomeExpenseBizType = {}));
/** 权限类型 */
var PermissionType;
(function (PermissionType) {
    PermissionType["MENU"] = "menu";
    PermissionType["ACTION"] = "action";
})(PermissionType || (exports.PermissionType = PermissionType = {}));
/** 启用状态 */
var EnableStatus;
(function (EnableStatus) {
    EnableStatus[EnableStatus["DISABLED"] = 0] = "DISABLED";
    EnableStatus[EnableStatus["ENABLED"] = 1] = "ENABLED";
})(EnableStatus || (exports.EnableStatus = EnableStatus = {}));
/** 用户状态 */
var UserStatus;
(function (UserStatus) {
    UserStatus[UserStatus["DISABLED"] = 0] = "DISABLED";
    UserStatus[UserStatus["ENABLED"] = 1] = "ENABLED";
})(UserStatus || (exports.UserStatus = UserStatus = {}));
/** 往来核销类型 */
var WriteOffType;
(function (WriteOffType) {
    WriteOffType["RECEIVABLE"] = "receivable";
    WriteOffType["PAYABLE"] = "payable";
})(WriteOffType || (exports.WriteOffType = WriteOffType = {}));
/** 员工性别 */
var EmployeeGender;
(function (EmployeeGender) {
    EmployeeGender["MALE"] = "male";
    EmployeeGender["FEMALE"] = "female";
    EmployeeGender["UNKNOWN"] = "unknown";
})(EmployeeGender || (exports.EmployeeGender = EmployeeGender = {}));
/** 员工状态 */
var EmployeeStatus;
(function (EmployeeStatus) {
    EmployeeStatus[EmployeeStatus["LEFT"] = 0] = "LEFT";
    EmployeeStatus[EmployeeStatus["ON_JOB"] = 1] = "ON_JOB";
})(EmployeeStatus || (exports.EmployeeStatus = EmployeeStatus = {}));
/** 报销单状态 */
var ExpenseClaimStatus;
(function (ExpenseClaimStatus) {
    ExpenseClaimStatus["DRAFT"] = "draft";
    ExpenseClaimStatus["APPROVED"] = "approved";
    ExpenseClaimStatus["PAID"] = "paid";
    ExpenseClaimStatus["REJECTED"] = "rejected";
})(ExpenseClaimStatus || (exports.ExpenseClaimStatus = ExpenseClaimStatus = {}));
/** 报销支付方式 */
var ExpensePayMethod;
(function (ExpensePayMethod) {
    ExpensePayMethod["ADVANCE"] = "advance";
    ExpensePayMethod["CASH"] = "cash";
    ExpensePayMethod["BANK"] = "bank";
})(ExpensePayMethod || (exports.ExpensePayMethod = ExpensePayMethod = {}));
/** 工资单状态 */
var PayrollStatus;
(function (PayrollStatus) {
    PayrollStatus["DRAFT"] = "draft";
    PayrollStatus["APPROVED"] = "approved";
    PayrollStatus["PAID"] = "paid";
})(PayrollStatus || (exports.PayrollStatus = PayrollStatus = {}));
/** 纳税人类型：决定增值税申报口径（小规模征收率 / 一般纳税人分税率） */
var TaxpayerType;
(function (TaxpayerType) {
    TaxpayerType["SMALL_SCALE"] = "small_scale";
    TaxpayerType["GENERAL"] = "general";
})(TaxpayerType || (exports.TaxpayerType = TaxpayerType = {}));
/** 票据类型 */
var ReceiptType;
(function (ReceiptType) {
    ReceiptType["INVOICE"] = "invoice";
    ReceiptType["ID_CARD"] = "id_card";
    ReceiptType["BUSINESS_LICENSE"] = "business_license";
    ReceiptType["TRAIN_TICKET"] = "train_ticket";
    ReceiptType["RECEIPT"] = "receipt";
    ReceiptType["PAYROLL"] = "payroll";
    ReceiptType["BANK_STATEMENT"] = "bank_statement";
    ReceiptType["EXPENSE_CLAIM"] = "expense_claim";
    ReceiptType["UNKNOWN"] = "unknown";
})(ReceiptType || (exports.ReceiptType = ReceiptType = {}));
/** 票据识别状态 */
var ReceiptStatus;
(function (ReceiptStatus) {
    ReceiptStatus["PARSED"] = "parsed";
    ReceiptStatus["DRAFTED"] = "drafted";
    ReceiptStatus["CONFIRMED"] = "confirmed";
    ReceiptStatus["REJECTED"] = "rejected";
    ReceiptStatus["DUPLICATE"] = "duplicate";
    ReceiptStatus["FAILED"] = "failed";
})(ReceiptStatus || (exports.ReceiptStatus = ReceiptStatus = {}));
/** 单据来源 */
var VoucherSource;
(function (VoucherSource) {
    VoucherSource["MANUAL"] = "manual";
    VoucherSource["CASH_BANK"] = "cash_bank";
    VoucherSource["AR_AP"] = "ar_ap";
    VoucherSource["INCOME_EXPENSE"] = "income_expense";
    VoucherSource["EXPENSE_CLAIM"] = "expense_claim";
    VoucherSource["PAYROLL"] = "payroll";
})(VoucherSource || (exports.VoucherSource = VoucherSource = {}));
/** 系统参数键 */
exports.SYS_CONFIG_KEYS = {
    FISCAL_START_DATE: 'fiscal_start_date', // 账期起始日期
    COMPANY_NAME: 'company_name', // 公司名称
    COMPANY_TAX_NO: 'company_tax_no', // 纳税人识别号
};
