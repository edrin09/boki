"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DepartmentsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const department_entity_1 = require("@core/entities/department.entity");
const voucher_entry_entity_1 = require("@core/entities/voucher-entry.entity");
const initial_balance_entity_1 = require("@core/entities/initial-balance.entity");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
const departments_service_1 = require("./departments.service");
const departments_controller_1 = require("./departments.controller");
let DepartmentsModule = class DepartmentsModule {
};
exports.DepartmentsModule = DepartmentsModule;
exports.DepartmentsModule = DepartmentsModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([department_entity_1.Department, voucher_entry_entity_1.VoucherEntry, initial_balance_entity_1.InitialBalance])],
        controllers: [departments_controller_1.DepartmentsController],
        providers: [departments_service_1.DepartmentsService, ...(0, company_repo_decorator_1.companyRepoProviders)(department_entity_1.Department, voucher_entry_entity_1.VoucherEntry, initial_balance_entity_1.InitialBalance)],
        exports: [departments_service_1.DepartmentsService],
    })
], DepartmentsModule);
