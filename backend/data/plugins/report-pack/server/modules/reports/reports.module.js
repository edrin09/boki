"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const account_entity_1 = require("@core/entities/account.entity");
const voucher_entity_1 = require("@core/entities/voucher.entity");
const voucher_entry_entity_1 = require("@core/entities/voucher-entry.entity");
const receipt_entity_1 = require("@core/entities/receipt.entity");
const partner_entity_1 = require("@core/entities/partner.entity");
const hr_entity_1 = require("@core/entities/hr.entity");
const fixed_expense_entity_1 = require("@core/entities/fixed-expense.entity");
const books_module_1 = require("@core/modules/books/books.module");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
const reports_service_1 = require("./reports.service");
const analysis_service_1 = require("./analysis.service");
const reports_controller_1 = require("./reports.controller");
let ReportsModule = class ReportsModule {
};
exports.ReportsModule = ReportsModule;
exports.ReportsModule = ReportsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                account_entity_1.Account,
                voucher_entity_1.Voucher,
                voucher_entry_entity_1.VoucherEntry,
                receipt_entity_1.Receipt,
                partner_entity_1.Partner,
                hr_entity_1.Payroll,
                hr_entity_1.ExpenseClaim,
                fixed_expense_entity_1.FixedExpense,
                fixed_expense_entity_1.FixedExpenseLog,
            ]),
            books_module_1.BooksModule,
        ],
        controllers: [reports_controller_1.ReportsController],
        providers: [
            reports_service_1.ReportsService,
            analysis_service_1.AnalysisService,
            ...(0, company_repo_decorator_1.companyRepoProviders)(account_entity_1.Account, voucher_entity_1.Voucher, voucher_entry_entity_1.VoucherEntry, receipt_entity_1.Receipt, partner_entity_1.Partner, hr_entity_1.Payroll, hr_entity_1.ExpenseClaim, fixed_expense_entity_1.FixedExpense, fixed_expense_entity_1.FixedExpenseLog),
        ],
        exports: [reports_service_1.ReportsService, analysis_service_1.AnalysisService],
    })
], ReportsModule);
