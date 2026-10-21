"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiCompanyModule = void 0;
const common_1 = require("@nestjs/common");
const companies_module_1 = require("./companies/companies.module");
/**
 * 多公司（账套）管理插件。
 *
 * 边界：
 * - 插件负责公司档案的 CRUD、成员授权与数据清理；
 * - 内核保留 `sys_company` / `sys_user_company` 实体、公司上下文、
 *   登录/权限判定，以及「创建首个账套」的 /companies/bootstrap 入口；
 * - 停用/卸载本插件后，既有账套仍可正常记账与切换，只是没有管理页面。
 */
let MultiCompanyModule = class MultiCompanyModule {
};
exports.MultiCompanyModule = MultiCompanyModule;
exports.MultiCompanyModule = MultiCompanyModule = __decorate([
    (0, common_1.Module)({
        imports: [companies_module_1.CompaniesModule],
    })
], MultiCompanyModule);
