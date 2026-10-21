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
exports.ASR_MODEL_FILES = exports.ASR_MODEL_SUBDIR = void 0;
exports.resolveAsrModelDir = resolveAsrModelDir;
exports.asrModelPath = asrModelPath;
exports.asrReady = asrReady;
exports.missingAsrModels = missingAsrModels;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
/**
 * 流式 Zipformer 模型（sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30）。
 *
 * 在线（流式）识别，WebSocket 逐字上屏；整段 REST 转写复用同一个在线识别器。
 * 字符级建模（cjkchar），无标点输出；数据：multi_zh-hans 14k 小时。
 *
 * 下载：npm run models:fetch-asr（scripts/fetch-asr-streaming-model.mjs）
 */
exports.ASR_MODEL_SUBDIR = 'zipformer-zh-streaming-int8';
exports.ASR_MODEL_FILES = {
    encoder: 'encoder.int8.onnx',
    decoder: 'decoder.onnx',
    joiner: 'joiner.int8.onnx',
    tokens: 'tokens.txt',
};
/**
 * 模型目录解析顺序（仿 ocr-model.path.ts 的回退策略）：
 * 环境变量 VOICE_MODEL_DIR → cwd/models/asr → __dirname 三级上溯。
 *
 * 开发期（nest start）与打包后（node dist/main）__dirname 分别落在
 * src/modules/voice-assistant 与 dist/modules/voice-assistant，
 * 向上三级都回到 backend 根目录，两种运行方式统一覆盖。
 */
function candidateDirs() {
    const fromEnv = process.env.VOICE_MODEL_DIR;
    const dirs = [];
    if (fromEnv)
        dirs.push(path.resolve(fromEnv));
    dirs.push(path.join(process.cwd(), 'models', 'asr', exports.ASR_MODEL_SUBDIR));
    dirs.push(path.resolve(__dirname, '..', '..', '..', 'models', 'asr', exports.ASR_MODEL_SUBDIR));
    return dirs;
}
function modelDir() {
    for (const dir of candidateDirs()) {
        if (fs.existsSync(path.join(dir, exports.ASR_MODEL_FILES.encoder)))
            return dir;
    }
    return candidateDirs()[candidateDirs().length - 1];
}
function resolveAsrModelDir() {
    return modelDir();
}
function asrModelPath(name) {
    return path.join(modelDir(), exports.ASR_MODEL_FILES[name]);
}
function asrReady() {
    return Object.values(exports.ASR_MODEL_FILES).every((f) => fs.existsSync(path.join(modelDir(), f)));
}
function missingAsrModels() {
    const dir = modelDir();
    return Object.values(exports.ASR_MODEL_FILES).filter((f) => !fs.existsSync(path.join(dir, f)));
}
