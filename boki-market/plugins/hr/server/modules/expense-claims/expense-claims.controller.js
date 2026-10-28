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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpenseClaimsController = void 0;
const common_1 = require("@nestjs/common");
const dayjs_1 = __importDefault(require("dayjs"));
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const expense_claims_service_1 = require("./expense-claims.service");
const expense_claims_import_service_1 = require("./expense-claims-import.service");
const hr_doc_pdf_service_1 = require("@core/common/pdf/hr-doc-pdf.service");
const zip_util_1 = require("@core/common/pdf/zip.util");
const expense_claim_dto_1 = require("./dto/expense-claim.dto");
const expense_claim_import_dto_1 = require("./dto/expense-claim-import.dto");
const pdf_package_dto_1 = require("@core/common/dto/pdf-package.dto");
const pagination_dto_1 = require("@core/common/dto/pagination.dto");
const permissions_decorator_1 = require("@core/common/decorators/permissions.decorator");
const operation_decorator_1 = require("@core/common/decorators/operation.decorator");
const request_util_1 = require("@core/common/utils/request.util");
let ExpenseClaimsController = class ExpenseClaimsController {
    service;
    importService;
    pdfService;
    constructor(service, importService, pdfService) {
        this.service = service;
        this.importService = importService;
        this.pdfService = pdfService;
    }
    findAll(query, status, employeeId, startDate, endDate) {
        return this.service.findAll({ ...query, status, employeeId, startDate, endDate });
    }
    nextNo(claimDate) {
        const date = claimDate || new Date().toISOString().slice(0, 10);
        return this.service.getNextClaimNo(date);
    }
    findOne(id) {
        return this.service.findOne(id);
    }
    /** 批量生成原始凭证 PDF 压缩包（ids 优先，否则按筛选条件，最多 300 张） */
    async pdfPackage(dto, res) {
        const docs = await this.service.findForPdfExport(dto);
        if (!docs.length)
            throw new common_1.NotFoundException('没有符合条件的报销单');
        const entries = [];
        for (const { claim, items } of docs) {
            const buffer = await this.pdfService.expenseClaimPdf(claim, items);
            entries.push({
                name: `${claim.claimNo}_${claim.employeeName}_${claim.claimDate}.pdf`,
                buffer,
            });
        }
        const zip = await (0, zip_util_1.zipEntries)(entries);
        (0, zip_util_1.sendZipResponse)(res, zip, `报销单原始凭证_${(0, dayjs_1.default)().format('YYYYMMDD_HHmmss')}.zip`);
    }
    create(dto, req) {
        return this.service.create(dto, this.operator(req));
    }
    importFile(file) {
        if (!file)
            throw new common_1.BadRequestException('请上传报销单文件（Excel/CSV）');
        return this.importService.parseFile(file.buffer, file.originalname);
    }
    importCommit(dto, req) {
        return this.importService.commit(dto, this.operator(req));
    }
    update(id, dto, req) {
        return this.service.update(id, dto, this.operator(req));
    }
    approve(id, req) {
        return this.service.approve(id, this.operator(req));
    }
    pay(id, dto, req) {
        return this.service.pay(id, dto, this.operator(req));
    }
    reject(id, dto) {
        return this.service.reject(id, dto.reason);
    }
    remove(id) {
        return this.service.remove(id);
    }
    operator(req) {
        const user = (0, request_util_1.getCurrentUser)(req);
        return { id: user.sub, nickname: user.nickname };
    }
};
exports.ExpenseClaimsController = ExpenseClaimsController;
__decorate([
    (0, common_1.Get)(),
    (0, permissions_decorator_1.RequirePermissions)('hr:expense-claim'),
    (0, operation_decorator_1.Operation)('查询报销单列表'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Query)('status')),
    __param(2, (0, common_1.Query)('employeeId')),
    __param(3, (0, common_1.Query)('startDate')),
    __param(4, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pagination_dto_1.PaginationQueryDto, String, String, String, String]),
    __metadata("design:returntype", void 0)
], ExpenseClaimsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('next-no'),
    (0, permissions_decorator_1.RequirePermissions)('hr:expense-claim', 'hr:expense-claim:create'),
    (0, operation_decorator_1.Operation)('获取下一个报销单号'),
    __param(0, (0, common_1.Query)('claimDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ExpenseClaimsController.prototype, "nextNo", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, permissions_decorator_1.RequirePermissions)('hr:expense-claim'),
    (0, operation_decorator_1.Operation)('查询报销单详情'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ExpenseClaimsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)('pdf-package'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('hr:expense-claim'),
    (0, operation_decorator_1.Operation)('批量生成报销单PDF（原始凭证存根）'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pdf_package_dto_1.HrPdfPackageDto, Object]),
    __metadata("design:returntype", Promise)
], ExpenseClaimsController.prototype, "pdfPackage", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, permissions_decorator_1.RequirePermissions)('hr:expense-claim:create'),
    (0, operation_decorator_1.Operation)('新增报销单'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [expense_claim_dto_1.SaveExpenseClaimDto, Object]),
    __metadata("design:returntype", void 0)
], ExpenseClaimsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('import'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('hr:expense-claim:create'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        storage: (0, multer_1.memoryStorage)(),
        defParamCharset: 'utf8',
        limits: { fileSize: 20 * 1024 * 1024 },
    })),
    (0, operation_decorator_1.Operation)('导入报销单（预览解析）'),
    __param(0, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ExpenseClaimsController.prototype, "importFile", null);
__decorate([
    (0, common_1.Post)('import/commit'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, permissions_decorator_1.RequirePermissions)('hr:expense-claim:create'),
    (0, operation_decorator_1.Operation)('确认导入报销单（生成草稿）'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [expense_claim_import_dto_1.CommitClaimsImportDto, Object]),
    __metadata("design:returntype", void 0)
], ExpenseClaimsController.prototype, "importCommit", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, permissions_decorator_1.RequirePermissions)('hr:expense-claim:update'),
    (0, operation_decorator_1.Operation)('编辑报销单'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, expense_claim_dto_1.SaveExpenseClaimDto, Object]),
    __metadata("design:returntype", void 0)
], ExpenseClaimsController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/approve'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('hr:expense-claim:approve'),
    (0, operation_decorator_1.Operation)('审核报销单'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ExpenseClaimsController.prototype, "approve", null);
__decorate([
    (0, common_1.Post)(':id/pay'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('hr:expense-claim:pay'),
    (0, operation_decorator_1.Operation)('报销单付款'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, expense_claim_dto_1.PayExpenseClaimDto, Object]),
    __metadata("design:returntype", void 0)
], ExpenseClaimsController.prototype, "pay", null);
__decorate([
    (0, common_1.Post)(':id/reject'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('hr:expense-claim:approve'),
    (0, operation_decorator_1.Operation)('驳回报销单'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, expense_claim_dto_1.RejectExpenseClaimDto]),
    __metadata("design:returntype", void 0)
], ExpenseClaimsController.prototype, "reject", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('hr:expense-claim:delete'),
    (0, operation_decorator_1.Operation)('删除报销单'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ExpenseClaimsController.prototype, "remove", null);
exports.ExpenseClaimsController = ExpenseClaimsController = __decorate([
    (0, common_1.Controller)('expense-claims'),
    __metadata("design:paramtypes", [expense_claims_service_1.ExpenseClaimsService,
        expense_claims_import_service_1.ExpenseClaimsImportService,
        hr_doc_pdf_service_1.HrDocPdfService])
], ExpenseClaimsController);
