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
exports.PayrollController = void 0;
const common_1 = require("@nestjs/common");
const dayjs_1 = __importDefault(require("dayjs"));
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const payroll_service_1 = require("./payroll.service");
const payroll_import_service_1 = require("./payroll-import.service");
const hr_doc_pdf_service_1 = require("@core/common/pdf/hr-doc-pdf.service");
const zip_util_1 = require("@core/common/pdf/zip.util");
const payroll_dto_1 = require("./dto/payroll.dto");
const payroll_import_dto_1 = require("./dto/payroll-import.dto");
const pdf_package_dto_1 = require("@core/common/dto/pdf-package.dto");
const pagination_dto_1 = require("@core/common/dto/pagination.dto");
const permissions_decorator_1 = require("@core/common/decorators/permissions.decorator");
const operation_decorator_1 = require("@core/common/decorators/operation.decorator");
const request_util_1 = require("@core/common/utils/request.util");
let PayrollController = class PayrollController {
    service;
    importService;
    pdfService;
    constructor(service, importService, pdfService) {
        this.service = service;
        this.importService = importService;
        this.pdfService = pdfService;
    }
    findAll(query, status, startPeriod, endPeriod) {
        return this.service.findAll({
            ...query,
            status,
            startPeriod: startPeriod ? Number(startPeriod) : undefined,
            endPeriod: endPeriod ? Number(endPeriod) : undefined,
        });
    }
    findOne(id) {
        return this.service.findOne(id);
    }
    /** 批量生成原始凭证 PDF 压缩包（ids 优先，否则按筛选条件，最多 300 张） */
    async pdfPackage(dto, res) {
        const docs = await this.service.findForPdfExport(dto);
        if (!docs.length)
            throw new common_1.NotFoundException('没有符合条件的工资单');
        const entries = [];
        for (const { payroll, items } of docs) {
            const buffer = await this.pdfService.payrollPdf(payroll, items);
            const periodText = `${Math.floor(payroll.period / 100)}年${payroll.period % 100}月`;
            entries.push({ name: `${payroll.payrollNo}_${periodText}工资表.pdf`, buffer });
        }
        const zip = await (0, zip_util_1.zipEntries)(entries);
        (0, zip_util_1.sendZipResponse)(res, zip, `工资表原始凭证_${(0, dayjs_1.default)().format('YYYYMMDD_HHmmss')}.zip`);
    }
    importFile(file) {
        if (!file)
            throw new common_1.BadRequestException('请上传工资表文件（Excel/CSV/图片/PDF）');
        return this.importService.parseFile(file.buffer, file.mimetype, file.originalname);
    }
    importCommit(dto, req) {
        return this.importService.commit(dto, this.operator(req));
    }
    generate(dto, req) {
        return this.service.generate(dto, this.operator(req));
    }
    create(dto, req) {
        return this.service.save(dto, this.operator(req));
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
    remove(id) {
        return this.service.remove(id);
    }
    operator(req) {
        const user = (0, request_util_1.getCurrentUser)(req);
        return { id: user.sub, nickname: user.nickname };
    }
};
exports.PayrollController = PayrollController;
__decorate([
    (0, common_1.Get)(),
    (0, permissions_decorator_1.RequirePermissions)('hr:payroll'),
    (0, operation_decorator_1.Operation)('查询工资单列表'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Query)('status')),
    __param(2, (0, common_1.Query)('startPeriod')),
    __param(3, (0, common_1.Query)('endPeriod')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pagination_dto_1.PaginationQueryDto, String, String, String]),
    __metadata("design:returntype", void 0)
], PayrollController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, permissions_decorator_1.RequirePermissions)('hr:payroll'),
    (0, operation_decorator_1.Operation)('查询工资单详情'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PayrollController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)('pdf-package'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('hr:payroll'),
    (0, operation_decorator_1.Operation)('批量生成工资表PDF（原始凭证存根）'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pdf_package_dto_1.PayrollPdfPackageDto, Object]),
    __metadata("design:returntype", Promise)
], PayrollController.prototype, "pdfPackage", null);
__decorate([
    (0, common_1.Post)('import'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('hr:payroll:create'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        storage: (0, multer_1.memoryStorage)(),
        // 中文文件名按 UTF-8 解码，避免默认 latin1 导致乱码
        defParamCharset: 'utf8',
        limits: { fileSize: 20 * 1024 * 1024 },
    })),
    (0, operation_decorator_1.Operation)('导入工资表（预览解析）'),
    __param(0, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PayrollController.prototype, "importFile", null);
__decorate([
    (0, common_1.Post)('import/commit'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, permissions_decorator_1.RequirePermissions)('hr:payroll:create'),
    (0, operation_decorator_1.Operation)('确认导入工资表（生成草稿）'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [payroll_import_dto_1.CommitPayrollImportDto, Object]),
    __metadata("design:returntype", void 0)
], PayrollController.prototype, "importCommit", null);
__decorate([
    (0, common_1.Post)('generate'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, permissions_decorator_1.RequirePermissions)('hr:payroll:create'),
    (0, operation_decorator_1.Operation)('按在职员工生成工资单'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [payroll_dto_1.GeneratePayrollDto, Object]),
    __metadata("design:returntype", void 0)
], PayrollController.prototype, "generate", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, permissions_decorator_1.RequirePermissions)('hr:payroll:create'),
    (0, operation_decorator_1.Operation)('保存工资单'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [payroll_dto_1.SavePayrollDto, Object]),
    __metadata("design:returntype", void 0)
], PayrollController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, permissions_decorator_1.RequirePermissions)('hr:payroll:update'),
    (0, operation_decorator_1.Operation)('编辑工资单'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, payroll_dto_1.SavePayrollDto, Object]),
    __metadata("design:returntype", void 0)
], PayrollController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/approve'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('hr:payroll:approve'),
    (0, operation_decorator_1.Operation)('审核工资单（计提工资）'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PayrollController.prototype, "approve", null);
__decorate([
    (0, common_1.Post)(':id/pay'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('hr:payroll:pay'),
    (0, operation_decorator_1.Operation)('发放工资'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, payroll_dto_1.PayPayrollDto, Object]),
    __metadata("design:returntype", void 0)
], PayrollController.prototype, "pay", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('hr:payroll:delete'),
    (0, operation_decorator_1.Operation)('删除工资单'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PayrollController.prototype, "remove", null);
exports.PayrollController = PayrollController = __decorate([
    (0, common_1.Controller)('payrolls'),
    __metadata("design:paramtypes", [payroll_service_1.PayrollService,
        payroll_import_service_1.PayrollImportService,
        hr_doc_pdf_service_1.HrDocPdfService])
], PayrollController);
