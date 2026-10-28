"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmployeesModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const hr_entity_1 = require("@core/entities/hr.entity");
const department_entity_1 = require("@core/entities/department.entity");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
const employees_service_1 = require("./employees.service");
const employees_import_service_1 = require("./employees-import.service");
const employees_controller_1 = require("./employees.controller");
const loans_module_1 = require("../loans/loans.module");
let EmployeesModule = class EmployeesModule {
};
exports.EmployeesModule = EmployeesModule;
exports.EmployeesModule = EmployeesModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([hr_entity_1.Employee, department_entity_1.Department, hr_entity_1.ExpenseClaim, hr_entity_1.PayrollItem, hr_entity_1.Loan, hr_entity_1.EmployeeSettlement]),
            // 复用员工往来核销服务（欠款余额汇总 / 核销流水查询）
            loans_module_1.LoansModule,
        ],
        controllers: [employees_controller_1.EmployeesController],
        providers: [
            employees_service_1.EmployeesService,
            employees_import_service_1.EmployeesImportService,
            ...(0, company_repo_decorator_1.companyRepoProviders)(hr_entity_1.Employee, department_entity_1.Department, hr_entity_1.ExpenseClaim, hr_entity_1.PayrollItem, hr_entity_1.Loan, hr_entity_1.EmployeeSettlement),
        ],
        exports: [employees_service_1.EmployeesService],
    })
], EmployeesModule);
