"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompaniesController = void 0;
const common_1 = require("@nestjs/common");
const companies_service_1 = require("./companies.service");
const company_dto_1 = require("./dto/company.dto");
const permissions_decorator_1 = require("@core/common/decorators/permissions.decorator");
const roles_decorator_1 = require("@core/common/decorators/roles.decorator");
const operation_decorator_1 = require("@core/common/decorators/operation.decorator");
const request_util_1 = require("@core/common/utils/request.util");
let CompaniesController = class CompaniesController {
    companiesService;
    constructor(companiesService) {
        this.companiesService = companiesService;
    }
    /**
     * 当前用户可管理的公司列表（登录后用于切换公司）
     */
    findMine(req) {
        return this.companiesService.findMyCompanies((0, request_util_1.getCurrentUser)(req).sub);
    }
    /** 公司详情（含成员列表） */
    findOne(id) {
        return this.companiesService.findOne(id);
    }
    /** 新建记账公司 */
    create(dto, req) {
        return this.companiesService.create(dto, (0, request_util_1.getCurrentUser)(req).sub);
    }
    /** 编辑公司 */
    update(id, dto) {
        return this.companiesService.update(id, dto);
    }
    /** 删除公司。无业务数据可直接删除；force=true 时连同全部业务数据一并删除（不可恢复） */
    remove(id, req, force) {
        return this.companiesService.remove(id, (0, request_util_1.getCurrentUser)(req).sub, force === 'true');
    }
    // ==================== 成员授权 ====================
    /** 追加授权用户 */
    addMember(id, dto) {
        return this.companiesService.addMembers(id, dto.userIds ?? []);
    }
    /** 全量设置成员（并可同时覆盖角色） */
    setMembers(id, dto) {
        return this.companiesService.setMembers(id, dto);
    }
    /** 取消授权 */
    removeMember(id, userId) {
        return this.companiesService.removeMember(id, userId);
    }
    /** 供日志/审计使用：切换公司后刷新缓存 */
    async ping(id, req) {
        await this.companiesService.assertUsable(id, (0, request_util_1.getCurrentUser)(req).sub);
        return { message: '可访问' };
    }
};
exports.CompaniesController = CompaniesController;
__decorate([
    (0, common_1.Get)(),
    (0, operation_decorator_1.Operation)('查询我可管理的公司'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CompaniesController.prototype, "findMine", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, permissions_decorator_1.RequirePermissions)('company:view'),
    (0, operation_decorator_1.Operation)('查询公司详情'),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CompaniesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.RequireRoles)('admin'),
    (0, operation_decorator_1.Operation)('新建记账公司'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [company_dto_1.CreateCompanyDto, Object]),
    __metadata("design:returntype", void 0)
], CompaniesController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, permissions_decorator_1.RequirePermissions)('company:update'),
    (0, operation_decorator_1.Operation)('编辑记账公司'),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, company_dto_1.UpdateCompanyDto]),
    __metadata("design:returntype", void 0)
], CompaniesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, roles_decorator_1.RequireRoles)('admin'),
    (0, operation_decorator_1.Operation)('删除记账公司'),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Query)('force')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", void 0)
], CompaniesController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':id/members'),
    (0, permissions_decorator_1.RequirePermissions)('company:member'),
    (0, operation_decorator_1.Operation)('添加公司成员'),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, company_dto_1.AddCompanyMemberDto]),
    __metadata("design:returntype", void 0)
], CompaniesController.prototype, "addMember", null);
__decorate([
    (0, common_1.Put)(':id/members'),
    (0, permissions_decorator_1.RequirePermissions)('company:member'),
    (0, operation_decorator_1.Operation)('设置公司成员'),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, company_dto_1.SetCompanyMemberDto]),
    __metadata("design:returntype", void 0)
], CompaniesController.prototype, "setMembers", null);
__decorate([
    (0, common_1.Delete)(':id/members/:userId'),
    (0, permissions_decorator_1.RequirePermissions)('company:member'),
    (0, operation_decorator_1.Operation)('移除公司成员'),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Param)('userId', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], CompaniesController.prototype, "removeMember", null);
__decorate([
    (0, common_1.Post)(':id/ping'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, operation_decorator_1.Operation)('校验公司可访问性'),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CompaniesController.prototype, "ping", null);
exports.CompaniesController = CompaniesController = __decorate([
    (0, common_1.Controller)('companies'),
    __metadata("design:paramtypes", [companies_service_1.CompaniesService])
], CompaniesController);
