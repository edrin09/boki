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
exports.OcrController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const ocr_engine_1 = require("./engine/ocr.engine");
const recognize_dto_1 = require("./dto/recognize.dto");
const operation_decorator_1 = require("@core/common/decorators/operation.decorator");
const ocr_model_path_1 = require("./engine/ocr-model.path");
const IMAGE_MIME = /^image\/(jpeg|png|webp|bmp|tiff)$/;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
let OcrController = class OcrController {
    engine;
    constructor(engine) {
        this.engine = engine;
    }
    status() {
        return {
            ready: this.engine.isReady(),
            modelDir: (0, ocr_model_path_1.resolveModelDir)(),
            missing: (0, ocr_model_path_1.missingModels)(),
        };
    }
    recognize(file, dto) {
        if (!file)
            throw new common_1.BadRequestException('请上传待识别的图片文件');
        if (!IMAGE_MIME.test(file.mimetype)) {
            throw new common_1.BadRequestException(`暂不支持的文件类型: ${file.mimetype}`);
        }
        if (!this.engine.isReady()) {
            throw new common_1.BadRequestException(`OCR 模型未就绪，缺失文件: ${(0, ocr_model_path_1.missingModels)().join(', ') || '无'}，模型目录: ${(0, ocr_model_path_1.resolveModelDir)()}`);
        }
        return this.engine.recognize(file.buffer, dto);
    }
};
exports.OcrController = OcrController;
__decorate([
    (0, common_1.Get)('status'),
    (0, operation_decorator_1.Operation)('查询 OCR 引擎状态'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], OcrController.prototype, "status", null);
__decorate([
    (0, common_1.Post)('recognize'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        storage: (0, multer_1.memoryStorage)(),
        // 中文文件名按 UTF-8 解码，避免默认 latin1 导致乱码
        defParamCharset: 'utf8',
        limits: { fileSize: MAX_UPLOAD_BYTES },
    })),
    (0, operation_decorator_1.Operation)('识别图片文字'),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, recognize_dto_1.RecognizeOptionsDto]),
    __metadata("design:returntype", void 0)
], OcrController.prototype, "recognize", null);
exports.OcrController = OcrController = __decorate([
    (0, common_1.Controller)('ocr'),
    __metadata("design:paramtypes", [ocr_engine_1.OcrEngine])
], OcrController);
