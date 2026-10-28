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
exports.ArApController = void 0;
const common_1 = require("@nestjs/common");
const ar_ap_service_1 = require("./ar-ap.service");
const ar_ap_dto_1 = require("./dto/ar-ap.dto");
const pagination_dto_1 = require("@core/common/dto/pagination.dto");
const permissions_decorator_1 = require("@core/common/decorators/permissions.decorator");
const operation_decorator_1 = require("@core/common/decorators/operation.decorator");
const request_util_1 = require("@core/common/utils/request.util");
let ArApController = class ArApController {
    arApService;
    constructor(arApService) {
        this.arApService = arApService;
    }
    receivable(query, partnerIds) {
        return this.arApService.receivable({ ...query, partnerIds: parseList(partnerIds) });
    }
    payable(query, partnerIds) {
        return this.arApService.payable({ ...query, partnerIds: parseList(partnerIds) });
    }
    findWriteOffs(query, type) {
        return this.arApService.findWriteOffs({ ...query, type });
    }
    createWriteOff(dto, req) {
        const user = (0, request_util_1.getCurrentUser)(req);
        const v = dto.autoApprove;
        const autoApprove = v === undefined ? true : !(v === false || v === 0 || v === 'false' || v === '0');
        return this.arApService.createWriteOff(dto, { id: user.sub, nickname: user.nickname }, autoApprove);
    }
    removeWriteOff(id) {
        return this.arApService.removeWriteOff(id);
    }
};
exports.ArApController = ArApController;
__decorate([
    (0, common_1.Get)('receivable'),
    (0, permissions_decorator_1.RequirePermissions)('ar-ap'),
    (0, operation_decorator_1.Operation)('查询应收往来余额'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Query)('partnerIds')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ar_ap_dto_1.QueryArApDto, String]),
    __metadata("design:returntype", void 0)
], ArApController.prototype, "receivable", null);
__decorate([
    (0, common_1.Get)('payable'),
    (0, permissions_decorator_1.RequirePermissions)('ar-ap'),
    (0, operation_decorator_1.Operation)('查询应付往来余额'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Query)('partnerIds')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ar_ap_dto_1.QueryArApDto, String]),
    __metadata("design:returntype", void 0)
], ArApController.prototype, "payable", null);
__decorate([
    (0, common_1.Get)('write-offs'),
    (0, permissions_decorator_1.RequirePermissions)('ar-ap'),
    (0, operation_decorator_1.Operation)('查询核销记录'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Query)('type')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pagination_dto_1.PaginationQueryDto, String]),
    __metadata("design:returntype", void 0)
], ArApController.prototype, "findWriteOffs", null);
__decorate([
    (0, common_1.Post)('write-off'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, permissions_decorator_1.RequirePermissions)('ar-ap:write-off'),
    (0, operation_decorator_1.Operation)('往来核销'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ar_ap_dto_1.CreateWriteOffDto, Object]),
    __metadata("design:returntype", void 0)
], ArApController.prototype, "createWriteOff", null);
__decorate([
    (0, common_1.Delete)('write-off/:id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('ar-ap:write-off'),
    (0, operation_decorator_1.Operation)('撤销核销'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ArApController.prototype, "removeWriteOff", null);
exports.ArApController = ArApController = __decorate([
    (0, common_1.Controller)('ar-ap'),
    __metadata("design:paramtypes", [ar_ap_service_1.ArApService])
], ArApController);
function parseList(value) {
    if (!value)
        return undefined;
    return value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}
