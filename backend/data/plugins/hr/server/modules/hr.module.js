"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HrPluginModule = void 0;
const common_1 = require("@nestjs/common");
const employees_module_1 = require("./employees/employees.module");
const expense_claims_module_1 = require("./expense-claims/expense-claims.module");
const loans_module_1 = require("./loans/loans.module");
const payroll_module_1 = require("./payroll/payroll.module");
/**
 * 薪酬报销插件模块。
 *
 * 员工、报销、借款、工资四个子模块共享核销与凭证能力；
 * 工资导入复用 ocr 插件的文档解析服务。
 */
let HrPluginModule = class HrPluginModule {
};
exports.HrPluginModule = HrPluginModule;
exports.HrPluginModule = HrPluginModule = __decorate([
    (0, common_1.Module)({
        imports: [employees_module_1.EmployeesModule, expense_claims_module_1.ExpenseClaimsModule, loans_module_1.LoansModule, payroll_module_1.PayrollModule],
        exports: [employees_module_1.EmployeesModule, expense_claims_module_1.ExpenseClaimsModule, loans_module_1.LoansModule, payroll_module_1.PayrollModule],
    })
], HrPluginModule);
