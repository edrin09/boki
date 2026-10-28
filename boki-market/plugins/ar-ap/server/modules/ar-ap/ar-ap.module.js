"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArApModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const business_entity_1 = require("@core/entities/business.entity");
const account_entity_1 = require("@core/entities/account.entity");
const bank_account_entity_1 = require("@core/entities/bank-account.entity");
const partner_entity_1 = require("@core/entities/partner.entity");
const voucher_entity_1 = require("@core/entities/voucher.entity");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
const books_module_1 = require("@core/modules/books/books.module");
const vouchers_module_1 = require("@core/modules/vouchers/vouchers.module");
const ar_ap_service_1 = require("./ar-ap.service");
const ar_ap_controller_1 = require("./ar-ap.controller");
let ArApModule = class ArApModule {
};
exports.ArApModule = ArApModule;
exports.ArApModule = ArApModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([business_entity_1.WriteOff, account_entity_1.Account, bank_account_entity_1.BankAccount, partner_entity_1.Partner, voucher_entity_1.Voucher]),
            books_module_1.BooksModule,
            vouchers_module_1.VouchersModule,
        ],
        controllers: [ar_ap_controller_1.ArApController],
        providers: [
            ar_ap_service_1.ArApService,
            ...(0, company_repo_decorator_1.companyRepoProviders)(business_entity_1.WriteOff, account_entity_1.Account, bank_account_entity_1.BankAccount, partner_entity_1.Partner, voucher_entity_1.Voucher),
        ],
        exports: [ar_ap_service_1.ArApService],
    })
], ArApModule);
