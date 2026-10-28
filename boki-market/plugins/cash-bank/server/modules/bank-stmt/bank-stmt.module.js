"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BankStmtModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const business_entity_1 = require("@core/entities/business.entity");
const account_entity_1 = require("@core/entities/account.entity");
const bank_account_entity_1 = require("@core/entities/bank-account.entity");
const partner_entity_1 = require("@core/entities/partner.entity");
const hr_entity_1 = require("@core/entities/hr.entity");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
const bank_stmt_controller_1 = require("./bank-stmt.controller");
const bank_stmt_service_1 = require("./bank-stmt.service");
const cash_bank_module_1 = require("../cash-bank/cash-bank.module");
let BankStmtModule = class BankStmtModule {
};
exports.BankStmtModule = BankStmtModule;
exports.BankStmtModule = BankStmtModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([business_entity_1.BankStmtRow, account_entity_1.Account, bank_account_entity_1.BankAccount, partner_entity_1.Partner, hr_entity_1.Loan, hr_entity_1.Employee]),
            cash_bank_module_1.CashBankModule,
        ],
        controllers: [bank_stmt_controller_1.BankStmtController],
        providers: [
            bank_stmt_service_1.BankStmtService,
            ...(0, company_repo_decorator_1.companyRepoProviders)(business_entity_1.BankStmtRow, account_entity_1.Account, bank_account_entity_1.BankAccount, partner_entity_1.Partner, hr_entity_1.Loan, hr_entity_1.Employee),
        ],
    })
], BankStmtModule);
