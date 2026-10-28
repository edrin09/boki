"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BanksModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const bank_account_entity_1 = require("@core/entities/bank-account.entity");
const account_entity_1 = require("@core/entities/account.entity");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
const banks_service_1 = require("./banks.service");
const banks_controller_1 = require("./banks.controller");
let BanksModule = class BanksModule {
};
exports.BanksModule = BanksModule;
exports.BanksModule = BanksModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([bank_account_entity_1.BankAccount, account_entity_1.Account])],
        controllers: [banks_controller_1.BanksController],
        providers: [banks_service_1.BanksService, ...(0, company_repo_decorator_1.companyRepoProviders)(bank_account_entity_1.BankAccount, account_entity_1.Account)],
        exports: [banks_service_1.BanksService],
    })
], BanksModule);
