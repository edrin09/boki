"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.REC_HEIGHT = exports.CLS_SHAPE = exports.REC_NORM = exports.DET_NORM = void 0;
exports.decodeToRgb = decodeToRgb;
exports.resizeRgb = resizeRgb;
exports.cropRgb = cropRgb;
exports.calcDetSize = calcDetSize;
exports.toChwTensor = toChwTensor;
exports.rotate180 = rotate180;
const sharp_1 = __importDefault(require("sharp"));
/** 检测阶段的归一化参数，与 PaddleOCR det 配置一致（注意：作用于 BGR 通道） */
exports.DET_NORM = {
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
};
/** 方向分类与文字识别的归一化参数，等价于 (x/255 - 0.5) / 0.5 */
exports.REC_NORM = {
    mean: [0.5, 0.5, 0.5],
    std: [0.5, 0.5, 0.5],
};
exports.CLS_SHAPE = { width: 192, height: 48 };
exports.REC_HEIGHT = 48;
async function decodeToRgb(input) {
    const { data, info } = await (0, sharp_1.default)(input)
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .toColorspace('srgb')
        .raw()
        .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
}
async function resizeRgb(img, width, height) {
    if (img.width === width && img.height === height)
        return img;
    const { data, info } = await (0, sharp_1.default)(img.data, {
        raw: { width: img.width, height: img.height, channels: 3 },
    })
        .resize(width, height, { fit: 'fill' })
        .raw()
        .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
}
function cropRgb(img, x1, y1, x2, y2) {
    const left = Math.max(0, Math.floor(x1));
    const top = Math.max(0, Math.floor(y1));
    const right = Math.min(img.width, Math.ceil(x2));
    const bottom = Math.min(img.height, Math.ceil(y2));
    const width = Math.max(1, right - left);
    const height = Math.max(1, bottom - top);
    const data = Buffer.allocUnsafe(width * height * 3);
    for (let row = 0; row < height; row++) {
        const srcStart = ((top + row) * img.width + left) * 3;
        img.data.copy(data, row * width * 3, srcStart, srcStart + width * 3);
    }
    return { data, width, height };
}
/**
 * 按长边上限等比缩放，并把宽高对齐到 32 的倍数。
 * DB 检测网络对下采样倍率敏感，宽高非 32 倍数会在拼接特征图时产生偏移。
 */
function calcDetSize(width, height, maxSide) {
    const longest = Math.max(width, height);
    const ratio = longest > maxSide ? maxSide / longest : 1;
    const align = (v) => Math.max(32, Math.round((v * ratio) / 32) * 32);
    return { width: align(width), height: align(height) };
}
/** 把 HWC 的 RGB 像素转成 CHW 的 Float32 张量，并按 BGR 顺序做归一化 */
function toChwTensor(img, mean, std, scale = 1 / 255) {
    const { data, width, height } = img;
    const plane = width * height;
    const out = new Float32Array(plane * 3);
    for (let i = 0; i < plane; i++) {
        const s = i * 3;
        // PaddleOCR 以 BGR 顺序送入网络，此处把 RGB 源数据按 BGR 落到通道平面
        out[i] = (data[s + 2] * scale - mean[0]) / std[0];
        out[plane + i] = (data[s + 1] * scale - mean[1]) / std[1];
        out[plane * 2 + i] = (data[s] * scale - mean[2]) / std[2];
    }
    return out;
}
function rotate180(img) {
    const { data, width, height } = img;
    const out = Buffer.allocUnsafe(data.length);
    const rowBytes = width * 3;
    for (let y = 0; y < height; y++) {
        const srcRow = height - 1 - y;
        for (let x = 0; x < width; x++) {
            const src = srcRow * rowBytes + (width - 1 - x) * 3;
            const dst = y * rowBytes + x * 3;
            out[dst] = data[src];
            out[dst + 1] = data[src + 1];
            out[dst + 2] = data[src + 2];
        }
    }
    return { data: out, width, height };
}
