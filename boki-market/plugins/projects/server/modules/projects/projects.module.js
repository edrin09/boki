"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const project_entity_1 = require("@core/entities/project.entity");
const voucher_entry_entity_1 = require("@core/entities/voucher-entry.entity");
const initial_balance_entity_1 = require("@core/entities/initial-balance.entity");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
const ocr_1 = require("@plugin/ocr/server/modules/ocr");
const projects_service_1 = require("./projects.service");
const projects_controller_1 = require("./projects.controller");
let ProjectsModule = class ProjectsModule {
};
exports.ProjectsModule = ProjectsModule;
exports.ProjectsModule = ProjectsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([project_entity_1.Project, voucher_entry_entity_1.VoucherEntry, initial_balance_entity_1.InitialBalance]),
            ocr_1.OcrModule,
        ],
        controllers: [projects_controller_1.ProjectsController],
        providers: [projects_service_1.ProjectsService, ...(0, company_repo_decorator_1.companyRepoProviders)(project_entity_1.Project, voucher_entry_entity_1.VoucherEntry, initial_balance_entity_1.InitialBalance)],
        exports: [projects_service_1.ProjectsService],
    })
], ProjectsModule);
