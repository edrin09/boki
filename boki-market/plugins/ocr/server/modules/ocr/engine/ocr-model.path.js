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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODEL_FILES = void 0;
exports.resolveModelDir = resolveModelDir;
exports.modelPath = modelPath;
exports.modelsReady = modelsReady;
exports.missingModels = missingModels;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
exports.MODEL_FILES = {
    det: 'det.onnx',
    cls: 'cls.onnx',
    rec: 'rec.onnx',
    /** PP-OCRv6 rec 配套大字典（从 rec.onnx 的 character 元数据抽取） */
    keys: 'ppocrv6_dict.txt',
};
/**
 * 模型目录解析顺序：环境变量优先，其次按可执行文件位置回退。
 *
 * 开发期（nest start）与打包后（node dist/main）本文件的 __dirname 分别落在
 * src/modules/ocr 与 dist/modules/ocr，向上三级都回到 backend 根目录，
 * 因此统一用三级回退即可覆盖两种运行方式。
 */
function candidateDirs() {
    const fromEnv = process.env.OCR_MODEL_DIR;
    const dirs = [];
    if (fromEnv)
        dirs.push(path.resolve(fromEnv));
    dirs.push(path.join(process.cwd(), 'models', 'ocr'));
    dirs.push(path.resolve(__dirname, '..', '..', '..', 'models', 'ocr'));
    return dirs;
}
function resolveModelDir() {
    for (const dir of candidateDirs()) {
        if (fs.existsSync(path.join(dir, exports.MODEL_FILES.det)))
            return dir;
    }
    return candidateDirs()[candidateDirs().length - 1];
}
function modelPath(name) {
    return path.join(resolveModelDir(), exports.MODEL_FILES[name]);
}
function modelsReady() {
    return Object.values(exports.MODEL_FILES).every((f) => fs.existsSync(path.join(resolveModelDir(), f)));
}
function missingModels() {
    const dir = resolveModelDir();
    return Object.values(exports.MODEL_FILES).filter((f) => !fs.existsSync(path.join(dir, f)));
}
