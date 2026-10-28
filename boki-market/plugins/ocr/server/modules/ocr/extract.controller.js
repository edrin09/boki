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
exports.ExtractController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const extract_service_1 = require("./extract.service");
const operation_decorator_1 = require("@core/common/decorators/operation.decorator");
const permissions_decorator_1 = require("@core/common/decorators/permissions.decorator");
const ALLOWED_MIME = /^(image\/(jpeg|png|webp|bmp|tiff)|application\/pdf)$/;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
/**
 * 证件抽取：路由挂在 /ocr 下，与识别引擎同属「识别」语义。
 * 实现放在独立模块，避免 ocr ↔ receipts 的模块环依赖。
 */
let ExtractController = class ExtractController {
    service;
    constructor(service) {
        this.service = service;
    }
    extract(file, target) {
        if (!file)
            throw new common_1.BadRequestException('请上传证件图片或 PDF 文件');
        if (!file.size)
            throw new common_1.BadRequestException('上传的文件为空');
        if (!ALLOWED_MIME.test(file.mimetype)) {
            throw new common_1.BadRequestException(`不支持的文件类型: ${file.originalname}（${file.mimetype}）`);
        }
        if (target !== 'partner' && target !== 'employee') {
            throw new common_1.BadRequestException('target 仅支持 partner 或 employee');
        }
        if (!this.service.isReady()) {
            throw new common_1.BadRequestException(this.service.notReadyMessage());
        }
        return this.service.extract(file.buffer, file.mimetype, file.originalname, target);
    }
};
exports.ExtractController = ExtractController;
__decorate([
    (0, common_1.Post)('extract'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        storage: (0, multer_1.memoryStorage)(),
        // 中文文件名按 UTF-8 解码，避免默认 latin1 导致乱码
        defParamCharset: 'utf8',
        limits: { fileSize: MAX_UPLOAD_BYTES },
    })),
    (0, permissions_decorator_1.RequirePermissions)('ocr:extract'),
    (0, operation_decorator_1.Operation)('识别证件并抽取档案字段'),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Query)('target')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ExtractController.prototype, "extract", null);
exports.ExtractController = ExtractController = __decorate([
    (0, common_1.Controller)('ocr'),
    __metadata("design:paramtypes", [extract_service_1.ExtractService])
], ExtractController);
