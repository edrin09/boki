"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OcrSupportModule = void 0;
const common_1 = require("@nestjs/common");
const ocr_engine_1 = require("./engine/ocr.engine");
const document_parse_service_1 = require("./document-parse.service");
/**
 * OCR 公共支撑模块。
 *
 * 只提供引擎与文档解析能力，不注册任何控制器，供插件间共享：
 * - `ocr` 插件自身：证件/票据识别接口
 * - `hr` 插件：工资导入
 * - `receipts` 插件：票据解析
 *
 * Nest 模块为单例，多处 import 不会重复加载 ONNX 模型。
 */
let OcrSupportModule = class OcrSupportModule {
};
exports.OcrSupportModule = OcrSupportModule;
exports.OcrSupportModule = OcrSupportModule = __decorate([
    (0, common_1.Module)({
        providers: [ocr_engine_1.OcrEngine, document_parse_service_1.DocumentParseService],
        exports: [ocr_engine_1.OcrEngine, document_parse_service_1.DocumentParseService],
    })
], OcrSupportModule);
