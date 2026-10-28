"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpenseClaimsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const hr_entity_1 = require("@core/entities/hr.entity");
const hr_entity_2 = require("@core/entities/hr.entity");
const department_entity_1 = require("@core/entities/department.entity");
const account_entity_1 = require("@core/entities/account.entity");
const bank_account_entity_1 = require("@core/entities/bank-account.entity");
const voucher_entity_1 = require("@core/entities/voucher.entity");
const vouchers_module_1 = require("@core/modules/vouchers/vouchers.module");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
const loans_module_1 = require("../loans/loans.module");
const expense_claims_service_1 = require("./expense-claims.service");
const expense_claims_import_service_1 = require("./expense-claims-import.service");
const hr_doc_pdf_service_1 = require("@core/common/pdf/hr-doc-pdf.service");
const expense_claims_controller_1 = require("./expense-claims.controller");
let ExpenseClaimsModule = class ExpenseClaimsModule {
};
exports.ExpenseClaimsModule = ExpenseClaimsModule;
exports.ExpenseClaimsModule = ExpenseClaimsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                hr_entity_1.ExpenseClaim,
                hr_entity_1.ExpenseClaimItem,
                hr_entity_2.Employee,
                department_entity_1.Department,
                account_entity_1.Account,
                bank_account_entity_1.BankAccount,
                voucher_entity_1.Voucher,
            ]),
            vouchers_module_1.VouchersModule,
            loans_module_1.LoansModule,
        ],
        controllers: [expense_claims_controller_1.ExpenseClaimsController],
        providers: [
            expense_claims_service_1.ExpenseClaimsService,
            expense_claims_import_service_1.ExpenseClaimsImportService,
            hr_doc_pdf_service_1.HrDocPdfService,
            ...(0, company_repo_decorator_1.companyRepoProviders)(hr_entity_1.ExpenseClaim, hr_entity_1.ExpenseClaimItem, hr_entity_2.Employee, department_entity_1.Department, account_entity_1.Account, bank_account_entity_1.BankAccount, voucher_entity_1.Voucher),
        ],
        exports: [expense_claims_service_1.ExpenseClaimsService],
    })
], ExpenseClaimsModule);
