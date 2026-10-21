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
exports.loadChars = loadChars;
exports.recInputWidth = recInputWidth;
exports.decodeCtc = decodeCtc;
exports.decideFlip = decideFlip;
const fs = __importStar(require("node:fs"));
const ocr_model_path_1 = require("./ocr-model.path");
const image_util_1 = require("./image.util");
let cachedChars = null;
/**
 * 识别模型的字符表：索引 0 为 CTC blank，末位为空格，中间为字典。
 * 与 rec 模型输出维度 6625 = 1 + 6623 + 1 对应。
 */
function loadChars() {
    if (cachedChars)
        return cachedChars;
    const raw = fs.readFileSync((0, ocr_model_path_1.modelPath)('keys'), 'utf8');
    const dict = raw.split(/\r?\n/).filter((line, idx, arr) => !(idx === arr.length - 1 && line === ''));
    cachedChars = ['', ...dict, ' '];
    return cachedChars;
}
function recInputWidth(cropWidth, cropHeight, maxWidth = 1600) {
    const ratio = cropWidth / Math.max(1, cropHeight);
    const width = Math.ceil(image_util_1.REC_HEIGHT * ratio);
    return Math.min(Math.max(width, 8), maxWidth);
}
/**
 * CTC 贪心解码：逐时间步取最大概率类别，合并重复、剔除 blank。
 * 得分取被保留字符的平均概率，用于后续判定是否需要人工复核。
 */
function decodeCtc(output, timeSteps, numClasses, chars = loadChars()) {
    let text = '';
    let scoreSum = 0;
    let kept = 0;
    let prevIndex = -1;
    for (let t = 0; t < timeSteps; t++) {
        const base = t * numClasses;
        let bestIndex = 0;
        let bestProb = output[base];
        for (let c = 1; c < numClasses; c++) {
            const p = output[base + c];
            if (p > bestProb) {
                bestProb = p;
                bestIndex = c;
            }
        }
        if (bestIndex !== 0 && bestIndex !== prevIndex) {
            const ch = chars[bestIndex];
            if (ch !== undefined) {
                text += ch;
                scoreSum += bestProb;
                kept++;
            }
        }
        prevIndex = bestIndex;
    }
    return { text, score: kept > 0 ? scoreSum / kept : 0 };
}
/** 方向分类输出为 [1,2]，标签 1 表示倒置；低置信度不翻转以免误伤 */
function decideFlip(output, threshold = 0.9) {
    const upright = output[0];
    const upsideDown = output[1];
    const label = upsideDown > upright ? 1 : 0;
    const score = Math.max(upright, upsideDown);
    return { flip: label === 1 && score >= threshold, score };
}
