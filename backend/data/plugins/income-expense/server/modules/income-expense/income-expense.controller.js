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
exports.IncomeExpenseController = void 0;
const common_1 = require("@nestjs/common");
const income_expense_service_1 = require("./income-expense.service");
const income_expense_dto_1 = require("./dto/income-expense.dto");
const pagination_dto_1 = require("@core/common/dto/pagination.dto");
const permissions_decorator_1 = require("@core/common/decorators/permissions.decorator");
const operation_decorator_1 = require("@core/common/decorators/operation.decorator");
const request_util_1 = require("@core/common/utils/request.util");
let IncomeExpenseController = class IncomeExpenseController {
    incomeExpenseService;
    constructor(incomeExpenseService) {
        this.incomeExpenseService = incomeExpenseService;
    }
    findAll(query, bizType, startDate, endDate) {
        return this.incomeExpenseService.findAll({ ...query, bizType, startDate, endDate });
    }
    findOne(id) {
        return this.incomeExpenseService.findOne(id);
    }
    create(dto, req) {
        const user = (0, request_util_1.getCurrentUser)(req);
        return this.incomeExpenseService.create(dto, { id: user.sub, nickname: user.nickname }, this.autoApprove(dto));
    }
    update(id, dto, req) {
        const user = (0, request_util_1.getCurrentUser)(req);
        return this.incomeExpenseService.update(id, dto, { id: user.sub, nickname: user.nickname }, this.autoApprove(dto));
    }
    remove(id) {
        return this.incomeExpenseService.remove(id);
    }
    autoApprove(dto) {
        const v = dto.autoApprove;
        if (v === undefined)
            return true;
        return !(v === false || v === 0 || v === 'false' || v === '0');
    }
};
exports.IncomeExpenseController = IncomeExpenseController;
__decorate([
    (0, common_1.Get)(),
    (0, permissions_decorator_1.RequirePermissions)('income-expense'),
    (0, operation_decorator_1.Operation)('查询其他收支单据'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Query)('bizType')),
    __param(2, (0, common_1.Query)('startDate')),
    __param(3, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pagination_dto_1.PaginationQueryDto, String, String, String]),
    __metadata("design:returntype", void 0)
], IncomeExpenseController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, permissions_decorator_1.RequirePermissions)('income-expense'),
    (0, operation_decorator_1.Operation)('查询其他收支单据详情'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], IncomeExpenseController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, permissions_decorator_1.RequirePermissions)('income-expense:create'),
    (0, operation_decorator_1.Operation)('新增其他收支单据'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [income_expense_dto_1.SaveIncomeExpenseDto, Object]),
    __metadata("design:returntype", void 0)
], IncomeExpenseController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, permissions_decorator_1.RequirePermissions)('income-expense:update'),
    (0, operation_decorator_1.Operation)('编辑其他收支单据'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, income_expense_dto_1.SaveIncomeExpenseDto, Object]),
    __metadata("design:returntype", void 0)
], IncomeExpenseController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('income-expense:delete'),
    (0, operation_decorator_1.Operation)('删除其他收支单据'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], IncomeExpenseController.prototype, "remove", null);
exports.IncomeExpenseController = IncomeExpenseController = __decorate([
    (0, common_1.Controller)('income-expense'),
    __metadata("design:paramtypes", [income_expense_service_1.IncomeExpenseService])
], IncomeExpenseController);
