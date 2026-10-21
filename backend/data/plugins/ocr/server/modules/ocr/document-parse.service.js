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
exports.DocumentParseService = void 0;
const common_1 = require("@nestjs/common");
const ocr_engine_1 = require("./engine/ocr.engine");
const ocr_model_path_1 = require("./engine/ocr-model.path");
const pdf_util_1 = require("./engine/pdf.util");
const parser_registry_1 = require("./parsers/parser.registry");
const MAX_DET_SIDE = 1600;
/**
 * 文件内容 → 结构化字段的公共链路。
 *
 * 票据上传（P15）与证件一键录入（P16）共用同一套解析能力：
 * 图片直接 OCR；PDF 优先文本层，扫描件渲染为图后 OCR。
 */
let DocumentParseService = class DocumentParseService {
    engine;
    constructor(engine) {
        this.engine = engine;
    }
    /** OCR 不可用时给出可读提示，避免底层 onnx 加载异常直接暴露 */
    requireOcr() {
        if (!this.engine.isReady()) {
            throw new common_1.BadRequestException(`OCR 模型未就绪，缺失文件: ${(0, ocr_model_path_1.missingModels)().join(', ') || '无'}，模型目录: ${(0, ocr_model_path_1.resolveModelDir)()}`);
        }
    }
    async parse(buffer, mimeType) {
        if (mimeType !== 'application/pdf') {
            this.requireOcr();
            const ocr = await this.engine.recognize(buffer, { detMaxSide: MAX_DET_SIDE });
            const rawText = ocr.lines.map((l) => l.text).join('\n');
            const result = (0, parser_registry_1.parseDocument)({
                lines: ocr.lines,
                rawText,
                width: ocr.width,
                height: ocr.height,
                source: 'ocr',
            });
            return { result, rawText, pageCount: 1, source: 'ocr' };
        }
        const pdf = await (0, pdf_util_1.parsePdf)(buffer);
        // 逐页合并：有文本层的页直接用文本层，只有无文本层的页才需要 OCR。
        // 混合型 PDF（部分页文本、部分页扫描）因此不会丢页。
        const needOcr = pdf.pages.some((p) => p.image);
        if (needOcr)
            this.requireOcr();
        const allLines = [];
        const rawParts = [];
        for (const page of pdf.pages) {
            if (page.lines.length > 0) {
                allLines.push(...page.lines);
                rawParts.push(page.rawText);
                continue;
            }
            if (!page.image)
                continue;
            const ocr = await this.engine.recognize(page.image, { detMaxSide: MAX_DET_SIDE });
            allLines.push(...ocr.lines);
            rawParts.push(ocr.lines.map((l) => l.text).join('\n'));
        }
        const rawText = rawParts.filter(Boolean).join('\n\n');
        if (!rawText.trim()) {
            throw new common_1.BadRequestException('未能从文件中提取到文字，请确认文件清晰或含文本层');
        }
        // 全部页面都来自文本层时置信度按 1 计，含 OCR 页时按 OCR 质量计
        const source = pdf.renderPageCount > 0 ? 'ocr' : 'pdf';
        const first = pdf.pages.find((p) => p.lines.length > 0) ?? pdf.pages[0];
        const result = (0, parser_registry_1.parseDocument)({
            lines: allLines,
            rawText,
            width: first?.width ?? 0,
            height: first?.height ?? 0,
            source,
        });
        return { result, rawText, pageCount: pdf.pageCount, source };
    }
};
exports.DocumentParseService = DocumentParseService;
exports.DocumentParseService = DocumentParseService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [ocr_engine_1.OcrEngine])
], DocumentParseService);
