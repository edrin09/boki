"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.entities = exports.module = void 0;
const ocr_module_1 = require("./modules/ocr/ocr.module");
exports.module = ocr_module_1.OcrPluginModule;
// OCR 不拥有业务实体；模型文件仍放在内核 models/ocr 目录。
exports.entities = [];
