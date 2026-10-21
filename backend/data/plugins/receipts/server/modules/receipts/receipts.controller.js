"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReceiptsController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const node_fs_1 = require("node:fs");
const path = __importStar(require("node:path"));
const receipts_service_1 = require("./receipts.service");
const workbench_service_1 = require("./workbench.service");
const classify_rules_service_1 = require("./classify-rules.service");
const operation_decorator_1 = require("@core/common/decorators/operation.decorator");
const skip_wrap_decorator_1 = require("@core/common/decorators/skip-wrap.decorator");
const permissions_decorator_1 = require("@core/common/decorators/permissions.decorator");
const enums_1 = require("@core/common/enums");
const workbench_dto_1 = require("./dto/workbench.dto");
const ALLOWED_MIME = /^(image\/(jpeg|png|webp|bmp|tiff)|application\/pdf)$/;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 20;
/**
 * 把 multipart 传来的 paths 字段规整成与 files 等长、按索引对应的数组。
 *
 * 情况：
 * - 未传 / 单文件上传 → 全 null（无目录信息）。
 * - multer 对同名多字段会收成 string[]；只传一个时会收成 string。
 * - 长度与 files 不一致（异常上传）→ 截断/补 null，保证下标不越界。
 */
function normalizePaths(raw, count) {
    if (raw == null)
        return new Array(count).fill(null);
    const list = Array.isArray(raw) ? raw : [raw];
    const out = [];
    for (let i = 0; i < count; i++) {
        const v = list[i];
        out.push(typeof v === 'string' && v.trim() ? v.trim() : null);
    }
    return out;
}
let ReceiptsController = class ReceiptsController {
    service;
    workbench;
    rules;
    constructor(service, workbench, rules) {
        this.service = service;
        this.workbench = workbench;
        this.rules = rules;
    }
    operator(req) {
        return { id: req.user?.id ?? 'system', nickname: req.user?.nickname ?? '系统' };
    }
    // ==================== 上传与列表（P15） ====================
    upload(files, body, req) {
        if (!files || files.length === 0)
            throw new common_1.BadRequestException('请选择要上传的图片或 PDF 文件');
        for (const file of files) {
            if (!ALLOWED_MIME.test(file.mimetype)) {
                throw new common_1.BadRequestException(`不支持的文件类型: ${file.originalname}（${file.mimetype}）`);
            }
        }
        // 文件夹批量上传时前端并行提交每个文件的 webkitRelativePath，
        // 与 files 按索引一一对应；单文件上传无该字段，全部按「无目录」处理。
        const paths = normalizePaths(body?.paths, files.length);
        return this.service.processUpload(files, req.user ?? null, paths);
    }
    list(receiptType, startDate, endDate, keyword, page, pageSize) {
        if (receiptType && !Object.values(enums_1.ReceiptType).includes(receiptType)) {
            throw new common_1.BadRequestException(`未知票据类型: ${receiptType}`);
        }
        return this.service.list({ receiptType, startDate, endDate, keyword, page, pageSize });
    }
    // ==================== 待确认工作台（P17.4） ====================
    pending(page, pageSize) {
        return this.workbench.pendingList({ page, pageSize });
    }
    confirmBatch(dto, req) {
        return this.workbench.confirmBatch(dto.ids, this.operator(req));
    }
    // ==================== 归类规则（P17.5） ====================
    listRules(keyword, matchType, page, pageSize) {
        return this.rules.findAll({ keyword, matchType, page, pageSize });
    }
    createRule(dto) {
        return this.rules.create(dto);
    }
    getRule(id) {
        return this.rules.findOne(id);
    }
    updateRule(id, dto) {
        return this.rules.update(id, dto);
    }
    removeRule(id) {
        return this.rules.remove(id);
    }
    toggleRule(id, dto) {
        return this.rules.toggle(id, dto);
    }
    // ==================== 票据详情与文件（P15/P17） ====================
    file(id, res) {
        void this.getReceiptFile(id, res);
    }
    async detail(id) {
        const receipt = await this.service.findOne(id);
        if (!receipt)
            throw new common_1.NotFoundException('票据不存在');
        return receipt;
    }
    update(id, dto) {
        return this.service.update(id, dto);
    }
    // ==================== 草稿与确认（P17.3/P17.4） ====================
    generateDraft(id, req) {
        return this.workbench.generateDraft(id, this.operator(req));
    }
    updateDraft(id, dto, req) {
        return this.workbench.updateDraft(id, dto, this.operator(req));
    }
    confirm(id, req) {
        return this.workbench.confirm(id, this.operator(req));
    }
    reject(id, dto) {
        return this.workbench.reject(id, dto);
    }
    async remove(id) {
        await this.service.remove(id);
        return { success: true };
    }
    // ==================== 内部 ====================
    async getReceiptFile(id, res) {
        const receipt = await this.service.findOne(id);
        if (!receipt)
            throw new common_1.NotFoundException('票据不存在');
        const abs = path.join((0, receipts_service_1.resolveUploadDir)(), '..', String(receipt.storagePath ?? ''));
        if (!(0, node_fs_1.existsSync)(abs))
            throw new common_1.NotFoundException('文件不存在');
        res.setHeader('Content-Type', String(receipt.mimeType ?? 'application/octet-stream'));
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(String(receipt.fileName ?? 'file'))}"`);
        (0, node_fs_1.createReadStream)(abs).pipe(res);
    }
};
exports.ReceiptsController = ReceiptsController;
__decorate([
    (0, common_1.Post)('upload'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UseInterceptors)((0, platform_express_1.FilesInterceptor)('files', MAX_FILES, {
        storage: (0, multer_1.memoryStorage)(),
        // 中文文件名按 UTF-8 解码，避免默认 latin1 导致乱码
        defParamCharset: 'utf8',
        limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
    })),
    (0, operation_decorator_1.Operation)('上传并识别票据'),
    __param(0, (0, common_1.UploadedFiles)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array, Object, Object]),
    __metadata("design:returntype", void 0)
], ReceiptsController.prototype, "upload", null);
__decorate([
    (0, common_1.Get)(),
    (0, permissions_decorator_1.RequirePermissions)('receipt:list'),
    (0, operation_decorator_1.Operation)('查询票据列表'),
    __param(0, (0, common_1.Query)('receiptType')),
    __param(1, (0, common_1.Query)('startDate')),
    __param(2, (0, common_1.Query)('endDate')),
    __param(3, (0, common_1.Query)('keyword')),
    __param(4, (0, common_1.Query)('page')),
    __param(5, (0, common_1.Query)('pageSize')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, Number, Number]),
    __metadata("design:returntype", void 0)
], ReceiptsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('pending'),
    (0, permissions_decorator_1.RequirePermissions)('receipt:list'),
    (0, operation_decorator_1.Operation)('查询待确认票据'),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('pageSize')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", void 0)
], ReceiptsController.prototype, "pending", null);
__decorate([
    (0, common_1.Post)('confirm-batch'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('receipt:confirm'),
    (0, operation_decorator_1.Operation)('批量确认入账'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [workbench_dto_1.ConfirmBatchDto, Object]),
    __metadata("design:returntype", void 0)
], ReceiptsController.prototype, "confirmBatch", null);
__decorate([
    (0, common_1.Get)('rules'),
    (0, permissions_decorator_1.RequirePermissions)('receipt:rule'),
    (0, operation_decorator_1.Operation)('查询归类规则'),
    __param(0, (0, common_1.Query)('keyword')),
    __param(1, (0, common_1.Query)('matchType')),
    __param(2, (0, common_1.Query)('page')),
    __param(3, (0, common_1.Query)('pageSize')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, Number]),
    __metadata("design:returntype", void 0)
], ReceiptsController.prototype, "listRules", null);
__decorate([
    (0, common_1.Post)('rules'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, permissions_decorator_1.RequirePermissions)('receipt:rule'),
    (0, operation_decorator_1.Operation)('新增归类规则'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [workbench_dto_1.SaveClassifyRuleDto]),
    __metadata("design:returntype", void 0)
], ReceiptsController.prototype, "createRule", null);
__decorate([
    (0, common_1.Get)('rules/:id'),
    (0, permissions_decorator_1.RequirePermissions)('receipt:rule'),
    (0, operation_decorator_1.Operation)('查询归类规则'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ReceiptsController.prototype, "getRule", null);
__decorate([
    (0, common_1.Put)('rules/:id'),
    (0, permissions_decorator_1.RequirePermissions)('receipt:rule'),
    (0, operation_decorator_1.Operation)('编辑归类规则'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, workbench_dto_1.SaveClassifyRuleDto]),
    __metadata("design:returntype", void 0)
], ReceiptsController.prototype, "updateRule", null);
__decorate([
    (0, common_1.Delete)('rules/:id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('receipt:rule'),
    (0, operation_decorator_1.Operation)('删除归类规则'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ReceiptsController.prototype, "removeRule", null);
__decorate([
    (0, common_1.Put)('rules/:id/toggle'),
    (0, permissions_decorator_1.RequirePermissions)('receipt:rule'),
    (0, operation_decorator_1.Operation)('启用/停用归类规则'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, workbench_dto_1.ToggleRuleDto]),
    __metadata("design:returntype", void 0)
], ReceiptsController.prototype, "toggleRule", null);
__decorate([
    (0, common_1.Get)(':id/file'),
    (0, skip_wrap_decorator_1.SkipWrap)(),
    (0, permissions_decorator_1.RequirePermissions)('receipt:list'),
    (0, operation_decorator_1.Operation)('查看票据原图'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ReceiptsController.prototype, "file", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, permissions_decorator_1.RequirePermissions)('receipt:list'),
    (0, operation_decorator_1.Operation)('查询票据详情'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ReceiptsController.prototype, "detail", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, permissions_decorator_1.RequirePermissions)('receipt:confirm'),
    (0, operation_decorator_1.Operation)('修正识别结果（票据类型/进销项方向）'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, workbench_dto_1.UpdateReceiptDto]),
    __metadata("design:returntype", void 0)
], ReceiptsController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/draft'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('receipt:confirm'),
    (0, operation_decorator_1.Operation)('生成凭证草稿'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ReceiptsController.prototype, "generateDraft", null);
__decorate([
    (0, common_1.Put)(':id/draft'),
    (0, permissions_decorator_1.RequirePermissions)('receipt:confirm'),
    (0, operation_decorator_1.Operation)('修改凭证草稿'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, workbench_dto_1.UpdateDraftDto, Object]),
    __metadata("design:returntype", void 0)
], ReceiptsController.prototype, "updateDraft", null);
__decorate([
    (0, common_1.Post)(':id/confirm'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('receipt:confirm'),
    (0, operation_decorator_1.Operation)('确认入账'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ReceiptsController.prototype, "confirm", null);
__decorate([
    (0, common_1.Post)(':id/reject'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('receipt:confirm'),
    (0, operation_decorator_1.Operation)('驳回票据'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, workbench_dto_1.RejectReceiptDto]),
    __metadata("design:returntype", void 0)
], ReceiptsController.prototype, "reject", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, permissions_decorator_1.RequirePermissions)('receipt:delete'),
    (0, operation_decorator_1.Operation)('删除票据'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ReceiptsController.prototype, "remove", null);
exports.ReceiptsController = ReceiptsController = __decorate([
    (0, common_1.Controller)('receipts'),
    __metadata("design:paramtypes", [receipts_service_1.ReceiptsService,
        workbench_service_1.ReceiptWorkbenchService,
        classify_rules_service_1.ClassifyRulesService])
], ReceiptsController);
