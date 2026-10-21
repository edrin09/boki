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
exports.LoansController = void 0;
const common_1 = require("@nestjs/common");
const dayjs_1 = __importDefault(require("dayjs"));
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const loans_service_1 = require("./loans.service");
const loans_import_service_1 = require("./loans-import.service");
const employee_settlement_service_1 = require("./employee-settlement.service");
const hr_doc_pdf_service_1 = require("@core/common/pdf/hr-doc-pdf.service");
const zip_util_1 = require("@core/common/pdf/zip.util");
const loan_dto_1 = require("./dto/loan.dto");
const loan_import_dto_1 = require("./dto/loan-import.dto");
const pdf_package_dto_1 = require("@core/common/dto/pdf-package.dto");
const pagination_dto_1 = require("@core/common/dto/pagination.dto");
const permissions_decorator_1 = require("@core/common/decorators/permissions.decorator");
const operation_decorator_1 = require("@core/common/decorators/operation.decorator");
const request_util_1 = require("@core/common/utils/request.util");
let LoansController = class LoansController {
    service;
    importService;
    settlementService;
    pdfService;
    constructor(service, importService, settlementService, pdfService) {
        this.service = service;
        this.importService = importService;
        this.settlementService = settlementService;
        this.pdfService = pdfService;
    }
    findAll(query, status, employeeId, startDate, endDate) {
        return this.service.findAll({ ...query, status, employeeId, startDate, endDate });
    }
    nextNo(loanDate) {
        const date = loanDate || new Date().toISOString().slice(0, 10);
        return this.service.getNextLoanNo(date);
    }
    /** 某员工尚未还清的借款单（报销/采购发票抵充时选择） */
    outstanding(employeeId) {
        return this.service.outstandingLoans(employeeId ?? '');
    }
    /** 员工往来余额（按员工汇总借款/已还/抵充/余额） */
    employeeBalances(query, keyword) {
        return this.settlementService.employeeBalances({ ...query, keyword });
    }
    /** 借款核销流水（还款/报销抵充/发票抵充/工资扣回） */
    settlements(query, employeeId, loanId) {
        return this.settlementService.settlements({ ...query, employeeId, loanId });
    }
    findOne(id) {
        return this.service.findOne(id);
    }
    /** 批量生成原始凭证 PDF 压缩包（ids 优先，否则按筛选条件，最多 300 张） */
    async pdfPackage(dto, res) {
        const loans = await this.service.findForPdfExport(dto);
        if (!loans.length)
            throw new common_1.NotFoundException('没有符合条件的借款单');
        const entries = [];
        for (const loan of loans) {
            const buffer = await this.pdfService.loanPdf(loan);
            entries.push({
                name: `${loan.loanNo}_${loan.employeeName}_${loan.loanDate}.pdf`,
                buffer,
            });
        }
        const zip = await (0, zip_util_1.zipEntries)(entries);
        (0, zip_util_1.sendZipResponse)(res, zip, `借款单原始凭证_${(0, dayjs_1.default)().format('YYYYMMDD_HHmmss')}.zip`);
    }
    create(dto, req) {
        return this.service.create(dto, this.operator(req));
    }
    importFile(file) {
        if (!file)
            throw new common_1.BadRequestException('请上传借款单文件（Excel/CSV）');
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
    repay(id, dto, req) {
        return this.service.repay(id, dto, this.operator(req));
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
exports.LoansController = LoansController;
__decorate([
    (0, common_1.Get)(),
    (0, permissions_decorator_1.RequirePermissions)('hr:loan'),
    (0, operation_decorator_1.Operation)('查询借款单列表'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Query)('status')),
    __param(2, (0, common_1.Query)('employeeId')),
    __param(3, (0, common_1.Query)('startDate')),
    __param(4, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pagination_dto_1.PaginationQueryDto, String, String, String, String]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('next-no'),
    (0, permissions_decorator_1.RequirePermissions)('hr:loan', 'hr:loan:create'),
    (0, operation_decorator_1.Operation)('获取下一个借款单号'),
    __param(0, (0, common_1.Query)('loanDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "nextNo", null);
__decorate([
    (0, common_1.Get)('outstanding'),
    (0, permissions_decorator_1.RequirePermissions)('hr:loan'),
    (0, operation_decorator_1.Operation)('查询员工未还清借款'),
    __param(0, (0, common_1.Query)('employeeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "outstanding", null);
__decorate([
    (0, common_1.Get)('employee-balances'),
    (0, permissions_decorator_1.RequirePermissions)('hr:loan'),
    (0, operation_decorator_1.Operation)('查询员工往来余额'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Query)('keyword')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pagination_dto_1.PaginationQueryDto, String]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "employeeBalances", null);
__decorate([
    (0, common_1.Get)('settlements'),
    (0, permissions_decorator_1.RequirePermissions)('hr:loan'),
    (0, operation_decorator_1.Operation)('查询借款核销流水'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Query)('employeeId')),
    __param(2, (0, common_1.Query)('loanId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pagination_dto_1.PaginationQueryDto, String, String]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "settlements", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, permissions_decorator_1.RequirePermissions)('hr:loan'),
    (0, operation_decorator_1.Operation)('查询借款单详情'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)('pdf-package'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('hr:loan'),
    (0, operation_decorator_1.Operation)('批量生成借款单PDF（原始凭证存根）'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pdf_package_dto_1.HrPdfPackageDto, Object]),
    __metadata("design:returntype", Promise)
], LoansController.prototype, "pdfPackage", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, permissions_decorator_1.RequirePermissions)('hr:loan:create'),
    (0, operation_decorator_1.Operation)('新增借款单'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [loan_dto_1.SaveLoanDto, Object]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('import'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('hr:loan:create'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        storage: (0, multer_1.memoryStorage)(),
        defParamCharset: 'utf8',
        limits: { fileSize: 20 * 1024 * 1024 },
    })),
    (0, operation_decorator_1.Operation)('导入借款单（预览解析）'),
    __param(0, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "importFile", null);
__decorate([
    (0, common_1.Post)('import/commit'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, permissions_decorator_1.RequirePermissions)('hr:loan:create'),
    (0, operation_decorator_1.Operation)('确认导入借款单（生成草稿）'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [loan_import_dto_1.CommitLoansImportDto, Object]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "importCommit", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, permissions_decorator_1.RequirePermissions)('hr:loan:update'),
    (0, operation_decorator_1.Operation)('编辑借款单'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, loan_dto_1.SaveLoanDto, Object]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/approve'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('hr:loan:approve'),
    (0, operation_decorator_1.Operation)('审核借款单（发放借款）'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "approve", null);
__decorate([
    (0, common_1.Post)(':id/repay'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('hr:loan:repay'),
    (0, operation_decorator_1.Operation)('借款单还款'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, loan_dto_1.RepayLoanDto, Object]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "repay", null);
__decorate([
    (0, common_1.Post)(':id/reject'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('hr:loan:approve'),
    (0, operation_decorator_1.Operation)('驳回借款单'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, loan_dto_1.RejectLoanDto]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "reject", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('hr:loan:delete'),
    (0, operation_decorator_1.Operation)('删除借款单'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "remove", null);
exports.LoansController = LoansController = __decorate([
    (0, common_1.Controller)('loans'),
    __metadata("design:paramtypes", [loans_service_1.LoansService,
        loans_import_service_1.LoansImportService,
        employee_settlement_service_1.EmployeeSettlementService,
        hr_doc_pdf_service_1.HrDocPdfService])
], LoansController);
