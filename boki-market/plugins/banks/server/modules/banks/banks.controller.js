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
exports.BanksController = void 0;
const common_1 = require("@nestjs/common");
const banks_service_1 = require("./banks.service");
const bank_dto_1 = require("./dto/bank.dto");
const pagination_dto_1 = require("@core/common/dto/pagination.dto");
const permissions_decorator_1 = require("@core/common/decorators/permissions.decorator");
const operation_decorator_1 = require("@core/common/decorators/operation.decorator");
let BanksController = class BanksController {
    banksService;
    constructor(banksService) {
        this.banksService = banksService;
    }
    findAll(query, type) {
        return this.banksService.findAll({ ...query, type });
    }
    options(type) {
        return this.banksService.findOptions(type);
    }
    findOne(id) {
        return this.banksService.findOne(id);
    }
    create(dto) {
        return this.banksService.create(dto);
    }
    update(id, dto) {
        return this.banksService.update(id, dto);
    }
    remove(id) {
        return this.banksService.remove(id);
    }
};
exports.BanksController = BanksController;
__decorate([
    (0, common_1.Get)(),
    (0, permissions_decorator_1.RequirePermissions)('settings:bank'),
    (0, operation_decorator_1.Operation)('查询资金账户列表'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Query)('type')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pagination_dto_1.PaginationQueryDto, String]),
    __metadata("design:returntype", void 0)
], BanksController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('options'),
    (0, operation_decorator_1.Operation)('查询资金账户下拉选项'),
    __param(0, (0, common_1.Query)('type')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], BanksController.prototype, "options", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, permissions_decorator_1.RequirePermissions)('settings:bank'),
    (0, operation_decorator_1.Operation)('查询资金账户详情'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], BanksController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, permissions_decorator_1.RequirePermissions)('bank:create'),
    (0, operation_decorator_1.Operation)('新增资金账户'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bank_dto_1.CreateBankDto]),
    __metadata("design:returntype", void 0)
], BanksController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, permissions_decorator_1.RequirePermissions)('bank:update'),
    (0, operation_decorator_1.Operation)('编辑资金账户'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, bank_dto_1.UpdateBankDto]),
    __metadata("design:returntype", void 0)
], BanksController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('bank:delete'),
    (0, operation_decorator_1.Operation)('删除资金账户'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], BanksController.prototype, "remove", null);
exports.BanksController = BanksController = __decorate([
    (0, common_1.Controller)('banks'),
    __metadata("design:paramtypes", [banks_service_1.BanksService])
], BanksController);
