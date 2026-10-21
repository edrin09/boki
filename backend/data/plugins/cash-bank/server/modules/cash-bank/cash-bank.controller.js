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
exports.CashBankController = void 0;
const common_1 = require("@nestjs/common");
const cash_bank_service_1 = require("./cash-bank.service");
const cash_bank_dto_1 = require("./dto/cash-bank.dto");
const pagination_dto_1 = require("@core/common/dto/pagination.dto");
const permissions_decorator_1 = require("@core/common/decorators/permissions.decorator");
const operation_decorator_1 = require("@core/common/decorators/operation.decorator");
const request_util_1 = require("@core/common/utils/request.util");
let CashBankController = class CashBankController {
    cashBankService;
    constructor(cashBankService) {
        this.cashBankService = cashBankService;
    }
    findAll(query, bizType, startDate, endDate) {
        return this.cashBankService.findAll({ ...query, bizType, startDate, endDate });
    }
    findOne(id) {
        return this.cashBankService.findOne(id);
    }
    create(dto, req) {
        return this.cashBankService.create(dto, this.operator(req), this.autoApprove(dto));
    }
    update(id, dto, req) {
        return this.cashBankService.update(id, dto, this.operator(req), this.autoApprove(dto));
    }
    remove(id, req) {
        return this.cashBankService.remove(id, this.operator(req));
    }
    operator(req) {
        const user = (0, request_util_1.getCurrentUser)(req);
        return { id: user.sub, nickname: user.nickname };
    }
    autoApprove(dto) {
        const v = dto.autoApprove;
        if (v === undefined)
            return true;
        return !(v === false || v === 0 || v === 'false' || v === '0');
    }
};
exports.CashBankController = CashBankController;
__decorate([
    (0, common_1.Get)(),
    (0, permissions_decorator_1.RequirePermissions)('cash-bank'),
    (0, operation_decorator_1.Operation)('查询现金银行单据'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Query)('bizType')),
    __param(2, (0, common_1.Query)('startDate')),
    __param(3, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pagination_dto_1.PaginationQueryDto, String, String, String]),
    __metadata("design:returntype", void 0)
], CashBankController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, permissions_decorator_1.RequirePermissions)('cash-bank'),
    (0, operation_decorator_1.Operation)('查询现金银行单据详情'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CashBankController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, permissions_decorator_1.RequirePermissions)('cash-bank:create'),
    (0, operation_decorator_1.Operation)('新增现金银行单据'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [cash_bank_dto_1.SaveCashFlowDto, Object]),
    __metadata("design:returntype", void 0)
], CashBankController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, permissions_decorator_1.RequirePermissions)('cash-bank:update'),
    (0, operation_decorator_1.Operation)('编辑现金银行单据'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, cash_bank_dto_1.SaveCashFlowDto, Object]),
    __metadata("design:returntype", void 0)
], CashBankController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('cash-bank:delete'),
    (0, operation_decorator_1.Operation)('删除现金银行单据'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], CashBankController.prototype, "remove", null);
exports.CashBankController = CashBankController = __decorate([
    (0, common_1.Controller)('cash-bank'),
    __metadata("design:paramtypes", [cash_bank_service_1.CashBankService])
], CashBankController);
