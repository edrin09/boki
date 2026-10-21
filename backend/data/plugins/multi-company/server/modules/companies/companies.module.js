"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompaniesModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const company_entity_1 = require("@core/entities/company.entity");
const user_company_entity_1 = require("@core/entities/user-company.entity");
const user_entity_1 = require("@core/entities/user.entity");
const role_entity_1 = require("@core/entities/role.entity");
const account_entity_1 = require("@core/entities/account.entity");
const voucher_entity_1 = require("@core/entities/voucher.entity");
const voucher_entry_entity_1 = require("@core/entities/voucher-entry.entity");
const companies_controller_1 = require("./companies.controller");
const companies_service_1 = require("./companies.service");
/**
 * 记账公司管理模块。
 *
 * 只接管公司档案的管理面（列表 / 新建 / 编辑 / 删除 / 成员授权）。
 * 公司上下文（JWT companyId）、CompanyScopeInterceptor、登录与权限判定
 * 仍在内核；`sys_company` / `sys_user_company` 也属于内核保留 schema，
 * 因此本插件 entities 为空，卸载插件不会删表。
 */
let CompaniesModule = class CompaniesModule {
};
exports.CompaniesModule = CompaniesModule;
exports.CompaniesModule = CompaniesModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                company_entity_1.Company,
                user_company_entity_1.UserCompany,
                user_entity_1.User,
                role_entity_1.Role,
                account_entity_1.Account,
                voucher_entity_1.Voucher,
                voucher_entry_entity_1.VoucherEntry,
            ]),
        ],
        controllers: [companies_controller_1.CompaniesController],
        providers: [companies_service_1.CompaniesService],
    })
], CompaniesModule);
