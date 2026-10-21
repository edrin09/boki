"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OcrPluginModule = void 0;
const common_1 = require("@nestjs/common");
const ocr_controller_1 = require("./ocr.controller");
const extract_controller_1 = require("./extract.controller");
const extract_service_1 = require("./extract.service");
const ocr_support_module_1 = require("./ocr-support.module");
/**
 * OCR 插件模块。
 *
 * OCR 引擎、PDF/图像工具与文档解析器均由本插件持有，
 * 通过 `OcrSupportModule` 共享给 hr / receipts 插件。
 */
let OcrPluginModule = class OcrPluginModule {
};
exports.OcrPluginModule = OcrPluginModule;
exports.OcrPluginModule = OcrPluginModule = __decorate([
    (0, common_1.Module)({
        imports: [ocr_support_module_1.OcrSupportModule],
        controllers: [ocr_controller_1.OcrController, extract_controller_1.ExtractController],
        providers: [extract_service_1.ExtractService],
        exports: [ocr_support_module_1.OcrSupportModule],
    })
], OcrPluginModule);
