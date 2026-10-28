"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CashBankModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const business_entity_1 = require("@core/entities/business.entity");
const account_entity_1 = require("@core/entities/account.entity");
const bank_account_entity_1 = require("@core/entities/bank-account.entity");
const voucher_entity_1 = require("@core/entities/voucher.entity");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
const vouchers_module_1 = require("@core/modules/vouchers/vouchers.module");
const cash_bank_service_1 = require("./cash-bank.service");
const cash_bank_controller_1 = require("./cash-bank.controller");
let CashBankModule = class CashBankModule {
};
exports.CashBankModule = CashBankModule;
exports.CashBankModule = CashBankModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([business_entity_1.CashFlow, account_entity_1.Account, bank_account_entity_1.BankAccount, voucher_entity_1.Voucher]),
            vouchers_module_1.VouchersModule,
        ],
        controllers: [cash_bank_controller_1.CashBankController],
        providers: [
            cash_bank_service_1.CashBankService,
            ...(0, company_repo_decorator_1.companyRepoProviders)(business_entity_1.CashFlow, account_entity_1.Account, bank_account_entity_1.BankAccount, voucher_entity_1.Voucher),
        ],
        exports: [cash_bank_service_1.CashBankService],
    })
], CashBankModule);
