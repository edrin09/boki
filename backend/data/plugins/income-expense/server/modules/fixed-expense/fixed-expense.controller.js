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
exports.FixedExpenseController = void 0;
const common_1 = require("@nestjs/common");
const fixed_expense_service_1 = require("./fixed-expense.service");
const fixed_expense_dto_1 = require("./dto/fixed-expense.dto");
const pagination_dto_1 = require("@core/common/dto/pagination.dto");
const permissions_decorator_1 = require("@core/common/decorators/permissions.decorator");
const operation_decorator_1 = require("@core/common/decorators/operation.decorator");
const request_util_1 = require("@core/common/utils/request.util");
let FixedExpenseController = class FixedExpenseController {
    service;
    constructor(service) {
        this.service = service;
    }
    findAll(query, status) {
        return this.service.findAll({ ...query, status: status });
    }
    pending(untilPeriod) {
        return this.service.pending(untilPeriod);
    }
    suggest(name) {
        return this.service.suggest(name ?? '');
    }
    logs(id) {
        return this.service.logs(id);
    }
    create(dto, req) {
        const user = (0, request_util_1.getCurrentUser)(req);
        return this.service.create(dto, { id: user.sub, nickname: user.nickname });
    }
    generate(req, body) {
        const user = (0, request_util_1.getCurrentUser)(req);
        return this.service.generate({ id: user.sub, nickname: user.nickname }, body?.untilPeriod);
    }
    update(id, dto) {
        return this.service.update(id, dto);
    }
    toggleStatus(id, body) {
        return this.service.toggleStatus(id, body?.status);
    }
    remove(id) {
        return this.service.remove(id);
    }
};
exports.FixedExpenseController = FixedExpenseController;
__decorate([
    (0, common_1.Get)(),
    (0, permissions_decorator_1.RequirePermissions)('fixed-expense'),
    (0, operation_decorator_1.Operation)('查询固定费用列表'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pagination_dto_1.PaginationQueryDto, String]),
    __metadata("design:returntype", void 0)
], FixedExpenseController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('pending'),
    (0, permissions_decorator_1.RequirePermissions)('fixed-expense'),
    (0, operation_decorator_1.Operation)('查询待生成固定费用'),
    __param(0, (0, common_1.Query)('untilPeriod')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], FixedExpenseController.prototype, "pending", null);
__decorate([
    (0, common_1.Get)('suggest'),
    (0, permissions_decorator_1.RequirePermissions)('fixed-expense'),
    (0, operation_decorator_1.Operation)('按名称智能推荐费用科目'),
    __param(0, (0, common_1.Query)('name')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], FixedExpenseController.prototype, "suggest", null);
__decorate([
    (0, common_1.Get)(':id/logs'),
    (0, permissions_decorator_1.RequirePermissions)('fixed-expense'),
    (0, operation_decorator_1.Operation)('查询固定费用生成历史'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], FixedExpenseController.prototype, "logs", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, permissions_decorator_1.RequirePermissions)('fixed-expense:create'),
    (0, operation_decorator_1.Operation)('新增固定费用'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [fixed_expense_dto_1.SaveFixedExpenseDto, Object]),
    __metadata("design:returntype", void 0)
], FixedExpenseController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('generate'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('fixed-expense:create'),
    (0, operation_decorator_1.Operation)('批量生成到期固定费用单据'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], FixedExpenseController.prototype, "generate", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, permissions_decorator_1.RequirePermissions)('fixed-expense:update'),
    (0, operation_decorator_1.Operation)('编辑固定费用'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, fixed_expense_dto_1.SaveFixedExpenseDto]),
    __metadata("design:returntype", void 0)
], FixedExpenseController.prototype, "update", null);
__decorate([
    (0, common_1.Put)(':id/status'),
    (0, permissions_decorator_1.RequirePermissions)('fixed-expense:update'),
    (0, operation_decorator_1.Operation)('启用/停用固定费用'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], FixedExpenseController.prototype, "toggleStatus", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('fixed-expense:delete'),
    (0, operation_decorator_1.Operation)('删除固定费用'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], FixedExpenseController.prototype, "remove", null);
exports.FixedExpenseController = FixedExpenseController = __decorate([
    (0, common_1.Controller)('fixed-expenses'),
    __metadata("design:paramtypes", [fixed_expense_service_1.FixedExpenseService])
], FixedExpenseController);
