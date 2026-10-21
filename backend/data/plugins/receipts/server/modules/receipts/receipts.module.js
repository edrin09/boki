"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReceiptsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const receipt_entity_1 = require("@core/entities/receipt.entity");
const classify_rule_entity_1 = require("@core/entities/classify-rule.entity");
const partner_entity_1 = require("@core/entities/partner.entity");
const account_entity_1 = require("@core/entities/account.entity");
const department_entity_1 = require("@core/entities/department.entity");
const voucher_entity_1 = require("@core/entities/voucher.entity");
const voucher_entry_entity_1 = require("@core/entities/voucher-entry.entity");
const hr_entity_1 = require("@core/entities/hr.entity");
const ocr_support_module_1 = require("@plugin/ocr/server/modules/ocr/ocr-support.module");
const vouchers_module_1 = require("@core/modules/vouchers/vouchers.module");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
const loans_module_1 = require("@plugin/hr/server/modules/loans/loans.module");
const expense_claims_module_1 = require("@plugin/hr/server/modules/expense-claims/expense-claims.module");
const receipts_controller_1 = require("./receipts.controller");
const receipts_service_1 = require("./receipts.service");
const classify_service_1 = require("./classify.service");
const classify_rules_service_1 = require("./classify-rules.service");
const workbench_service_1 = require("./workbench.service");
const party_sync_service_1 = require("./party-sync.service");
let ReceiptsModule = class ReceiptsModule {
};
exports.ReceiptsModule = ReceiptsModule;
exports.ReceiptsModule = ReceiptsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                receipt_entity_1.Receipt,
                classify_rule_entity_1.ClassifyRule,
                partner_entity_1.Partner,
                account_entity_1.Account,
                department_entity_1.Department,
                voucher_entity_1.Voucher,
                voucher_entry_entity_1.VoucherEntry,
                hr_entity_1.Employee,
                hr_entity_1.Loan,
            ]),
            ocr_support_module_1.OcrSupportModule,
            vouchers_module_1.VouchersModule,
            loans_module_1.LoansModule,
            expense_claims_module_1.ExpenseClaimsModule,
        ],
        controllers: [receipts_controller_1.ReceiptsController],
        providers: [
            receipts_service_1.ReceiptsService,
            classify_service_1.ClassifyService,
            classify_rules_service_1.ClassifyRulesService,
            workbench_service_1.ReceiptWorkbenchService,
            party_sync_service_1.PartySyncService,
            ...(0, company_repo_decorator_1.companyRepoProviders)(receipt_entity_1.Receipt, classify_rule_entity_1.ClassifyRule, partner_entity_1.Partner, account_entity_1.Account, department_entity_1.Department, voucher_entity_1.Voucher, voucher_entry_entity_1.VoucherEntry, hr_entity_1.Employee, hr_entity_1.Loan),
        ],
        exports: [receipts_service_1.ReceiptsService, classify_service_1.ClassifyService],
    })
], ReceiptsModule);
