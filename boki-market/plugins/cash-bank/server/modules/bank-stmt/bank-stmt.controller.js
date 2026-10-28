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
exports.BankStmtController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const bank_stmt_service_1 = require("./bank-stmt.service");
const pagination_dto_1 = require("@core/common/dto/pagination.dto");
const permissions_decorator_1 = require("@core/common/decorators/permissions.decorator");
const operation_decorator_1 = require("@core/common/decorators/operation.decorator");
const request_util_1 = require("@core/common/utils/request.util");
let BankStmtController = class BankStmtController {
    service;
    constructor(service) {
        this.service = service;
    }
    /** 上传对账单（Excel/CSV），解析落库并自动匹配 */
    import(file, bankAccountId, req) {
        if (!file)
            throw new common_1.BadRequestException('请上传对账单文件');
        return this.service.import({ buffer: file.buffer, originalName: file.originalname }, bankAccountId, this.operator(req));
    }
    findAll(query, status, batchId, startDate, endDate) {
        return this.service.findAll({ ...query, status, batchId, startDate, endDate });
    }
    summary() {
        return this.service.summary();
    }
    /** 待确认行入账（生成资金单据+凭证） */
    book(id, dto, req) {
        return this.service.book(id, dto, this.operator(req));
    }
    /** 一键智能批量入账：高置信建议行（利息/手续费/员工往来/回款/工资等）自动入账 */
    batchBook(req) {
        return this.service.batchBook(this.operator(req));
    }
    skip(id, dto) {
        return this.service.skip(id, dto?.remark);
    }
    restore(id) {
        return this.service.restore(id);
    }
    remove(id, req) {
        return this.service.remove(id, this.operator(req));
    }
    removeBatch(batchId, req) {
        return this.service.removeBatch(batchId, this.operator(req));
    }
    operator(req) {
        const user = (0, request_util_1.getCurrentUser)(req);
        return { id: user.sub, nickname: user.nickname };
    }
};
exports.BankStmtController = BankStmtController;
__decorate([
    (0, common_1.Post)('import'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    (0, permissions_decorator_1.RequirePermissions)('bank-stmt:import'),
    (0, operation_decorator_1.Operation)('导入银行对账单'),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Body)('bankAccountId')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], BankStmtController.prototype, "import", null);
__decorate([
    (0, common_1.Get)(),
    (0, permissions_decorator_1.RequirePermissions)('bank-stmt'),
    (0, operation_decorator_1.Operation)('查询银行流水'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Query)('status')),
    __param(2, (0, common_1.Query)('batchId')),
    __param(3, (0, common_1.Query)('startDate')),
    __param(4, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pagination_dto_1.PaginationQueryDto, String, String, String, String]),
    __metadata("design:returntype", void 0)
], BankStmtController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('summary'),
    (0, permissions_decorator_1.RequirePermissions)('bank-stmt'),
    (0, operation_decorator_1.Operation)('银行流水汇总'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], BankStmtController.prototype, "summary", null);
__decorate([
    (0, common_1.Post)(':id/book'),
    (0, permissions_decorator_1.RequirePermissions)('bank-stmt:book'),
    (0, operation_decorator_1.Operation)('流水行入账'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], BankStmtController.prototype, "book", null);
__decorate([
    (0, common_1.Post)('batch-book'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('bank-stmt:book'),
    (0, operation_decorator_1.Operation)('智能批量入账'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BankStmtController.prototype, "batchBook", null);
__decorate([
    (0, common_1.Post)(':id/skip'),
    (0, permissions_decorator_1.RequirePermissions)('bank-stmt:book'),
    (0, operation_decorator_1.Operation)('跳过流水行'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BankStmtController.prototype, "skip", null);
__decorate([
    (0, common_1.Post)(':id/restore'),
    (0, permissions_decorator_1.RequirePermissions)('bank-stmt:book'),
    (0, operation_decorator_1.Operation)('恢复流水行为待确认'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], BankStmtController.prototype, "restore", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('bank-stmt:delete'),
    (0, operation_decorator_1.Operation)('删除流水行'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BankStmtController.prototype, "remove", null);
__decorate([
    (0, common_1.Delete)('batch/:batchId'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('bank-stmt:delete'),
    (0, operation_decorator_1.Operation)('按批次删除流水'),
    __param(0, (0, common_1.Param)('batchId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BankStmtController.prototype, "removeBatch", null);
exports.BankStmtController = BankStmtController = __decorate([
    (0, common_1.Controller)('bank-stmt'),
    __metadata("design:paramtypes", [bank_stmt_service_1.BankStmtService])
], BankStmtController);
