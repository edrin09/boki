"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IamModule = void 0;
const common_1 = require("@nestjs/common");
const users_module_1 = require("./users/users.module");
const roles_module_1 = require("./roles/roles.module");
const permissions_module_1 = require("./permissions/permissions.module");
/**
 * 用户与权限管理插件（IAM）。
 *
 * 只接管「管理面」：用户 CRUD、角色、权限树与授权。
 * 登录、JWT、公司上下文、权限判定（GlobalAuthGuard / PermissionsGuard /
 * RolesGuard）与权限/角色种子仍留在内核，保证未安装本插件时：
 * - 内置管理员仍可登录并拥有全部权限；
 * - 内核记账流程不受影响。
 */
let IamModule = class IamModule {
};
exports.IamModule = IamModule;
exports.IamModule = IamModule = __decorate([
    (0, common_1.Module)({
        imports: [users_module_1.UsersModule, roles_module_1.RolesModule, permissions_module_1.PermissionsModule],
    })
], IamModule);
