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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExtractService = void 0;
const common_1 = require("@nestjs/common");
const ocr_engine_1 = require("./engine/ocr.engine");
const ocr_model_path_1 = require("./engine/ocr-model.path");
const document_parse_service_1 = require("./document-parse.service");
const field_map_1 = require("./field-map");
let ExtractService = class ExtractService {
    parser;
    engine;
    constructor(parser, engine) {
        this.parser = parser;
        this.engine = engine;
    }
    isReady() {
        return this.engine.isReady();
    }
    notReadyMessage() {
        return `OCR 模型未就绪，缺失文件: ${(0, ocr_model_path_1.missingModels)().join(', ') || '无'}，模型目录: ${(0, ocr_model_path_1.resolveModelDir)()}`;
    }
    async extract(buffer, mimeType, fileName, target) {
        let parsed;
        try {
            parsed = await this.parser.parse(buffer, mimeType);
        }
        catch (err) {
            throw new common_1.BadRequestException(`文件内容无法解析，请确认上传的是清晰的证件图片或 PDF（${err.message}）`);
        }
        const { result, source } = parsed;
        const map = field_map_1.FIELD_MAP[target];
        const fields = result.fields.map((f) => {
            const mapped = map[f.key];
            const rawValue = f.value;
            const value = mapped?.transform ? mapped.transform(rawValue) : rawValue;
            const hasValue = value !== null && value !== undefined && String(value).trim() !== '';
            return {
                key: f.key,
                label: f.label,
                value,
                confidence: f.confidence,
                targetKey: mapped?.key ?? null,
                targetLabel: mapped?.label ?? null,
                selected: Boolean(mapped) && hasValue && f.confidence >= field_map_1.AUTO_SELECT_CONFIDENCE,
            };
        });
        const values = {};
        for (const f of fields) {
            if (f.targetKey && f.selected && f.value !== null)
                values[f.targetKey] = f.value;
        }
        const docTypeMatched = result.type === field_map_1.EXPECTED_DOC_TYPE[target];
        return {
            fileName,
            target,
            targetLabel: field_map_1.TARGET_LABELS[target],
            docType: result.type,
            docTypeName: result.typeName,
            docTypeMatched,
            confidence: result.confidence,
            source,
            fields,
            values,
            message: docTypeMatched
                ? undefined
                : `识别为「${result.typeName}」，与${field_map_1.TARGET_LABELS[target]}档案不匹配，请确认后手动填写`,
        };
    }
};
exports.ExtractService = ExtractService;
exports.ExtractService = ExtractService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [document_parse_service_1.DocumentParseService,
        ocr_engine_1.OcrEngine])
], ExtractService);
