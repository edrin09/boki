"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePdf = exports.resolveModelDir = exports.missingModels = exports.OcrEngine = exports.DocumentParseService = exports.OcrSupportModule = exports.OcrPluginModule = exports.OcrModule = void 0;
/**
 * OCR 插件对其他插件暴露的公共接口。
 *
 * 依赖本插件的插件应从这里导入，避免直接依赖内部文件布局。
 */
var ocr_module_1 = require("./ocr.module");
Object.defineProperty(exports, "OcrModule", { enumerable: true, get: function () { return ocr_module_1.OcrPluginModule; } });
Object.defineProperty(exports, "OcrPluginModule", { enumerable: true, get: function () { return ocr_module_1.OcrPluginModule; } });
var ocr_support_module_1 = require("./ocr-support.module");
Object.defineProperty(exports, "OcrSupportModule", { enumerable: true, get: function () { return ocr_support_module_1.OcrSupportModule; } });
var document_parse_service_1 = require("./document-parse.service");
Object.defineProperty(exports, "DocumentParseService", { enumerable: true, get: function () { return document_parse_service_1.DocumentParseService; } });
var ocr_engine_1 = require("./engine/ocr.engine");
Object.defineProperty(exports, "OcrEngine", { enumerable: true, get: function () { return ocr_engine_1.OcrEngine; } });
var ocr_model_path_1 = require("./engine/ocr-model.path");
Object.defineProperty(exports, "missingModels", { enumerable: true, get: function () { return ocr_model_path_1.missingModels; } });
Object.defineProperty(exports, "resolveModelDir", { enumerable: true, get: function () { return ocr_model_path_1.resolveModelDir; } });
var pdf_util_1 = require("./engine/pdf.util");
Object.defineProperty(exports, "parsePdf", { enumerable: true, get: function () { return pdf_util_1.parsePdf; } });
