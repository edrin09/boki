"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FixedExpenseModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const fixed_expense_entity_1 = require("@core/entities/fixed-expense.entity");
const account_entity_1 = require("@core/entities/account.entity");
const bank_account_entity_1 = require("@core/entities/bank-account.entity");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
const income_expense_module_1 = require("../income-expense/income-expense.module");
const fixed_expense_service_1 = require("./fixed-expense.service");
const fixed_expense_controller_1 = require("./fixed-expense.controller");
let FixedExpenseModule = class FixedExpenseModule {
};
exports.FixedExpenseModule = FixedExpenseModule;
exports.FixedExpenseModule = FixedExpenseModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([fixed_expense_entity_1.FixedExpense, fixed_expense_entity_1.FixedExpenseLog, account_entity_1.Account, bank_account_entity_1.BankAccount]),
            income_expense_module_1.IncomeExpenseModule,
        ],
        controllers: [fixed_expense_controller_1.FixedExpenseController],
        providers: [
            fixed_expense_service_1.FixedExpenseService,
            ...(0, company_repo_decorator_1.companyRepoProviders)(fixed_expense_entity_1.FixedExpense, fixed_expense_entity_1.FixedExpenseLog, account_entity_1.Account, bank_account_entity_1.BankAccount),
        ],
        exports: [fixed_expense_service_1.FixedExpenseService],
    })
], FixedExpenseModule);
