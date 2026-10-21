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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
exports.OcrEngine = void 0;
const common_1 = require("@nestjs/common");
const ort = __importStar(require("onnxruntime-node"));
const image_util_1 = require("./image.util");
const det_postprocess_1 = require("./det.postprocess");
const rec_postprocess_1 = require("./rec.postprocess");
const ocr_model_path_1 = require("./ocr-model.path");
const DEFAULTS = {
    detMaxSide: 960,
    detThresh: 0.3,
    boxThresh: 0.6,
    unclipRatio: 1.5,
    useAngleCls: true,
};
/**
 * 逐项回退默认值。
 *
 * 不能直接用对象展开：经过 ValidationPipe 转换的 DTO 实例会把声明过的字段
 * 以 undefined 形式带上，展开后会把默认值抹成 undefined。
 */
function withDefaults(options) {
    const o = options ?? {};
    return {
        detMaxSide: o.detMaxSide ?? DEFAULTS.detMaxSide,
        detThresh: o.detThresh ?? DEFAULTS.detThresh,
        boxThresh: o.boxThresh ?? DEFAULTS.boxThresh,
        unclipRatio: o.unclipRatio ?? DEFAULTS.unclipRatio,
        useAngleCls: o.useAngleCls ?? DEFAULTS.useAngleCls,
    };
}
/** 限制同时在跑的推理数量，避免批量上传时把 CPU 打满 */
class Semaphore {
    limit;
    active = 0;
    queue = [];
    constructor(limit) {
        this.limit = limit;
    }
    async acquire() {
        if (this.active < this.limit) {
            this.active++;
            return;
        }
        await new Promise((resolve) => this.queue.push(resolve));
        this.active++;
    }
    release() {
        this.active--;
        const next = this.queue.shift();
        if (next)
            next();
    }
}
let OcrEngine = class OcrEngine {
    logger = new common_1.Logger('OcrEngine');
    semaphore = new Semaphore(2);
    detSession;
    clsSession;
    recSession;
    loading;
    async onModuleInit() {
        if (!(0, ocr_model_path_1.modelsReady)()) {
            this.logger.warn(`OCR 模型不完整，识别功能不可用。缺失: ${(0, ocr_model_path_1.missingModels)().join(', ')}，模型目录: ${(0, ocr_model_path_1.resolveModelDir)()}`);
            return;
        }
        try {
            await this.ensureLoaded();
            await this.warmup();
            this.logger.log(`OCR 模型加载完成: ${(0, ocr_model_path_1.resolveModelDir)()}`);
        }
        catch (err) {
            this.logger.error(`OCR 模型加载失败: ${err.message}`);
        }
    }
    isReady() {
        return Boolean(this.detSession && this.recSession);
    }
    async ensureLoaded() {
        if (this.detSession && this.recSession)
            return;
        if (!this.loading) {
            this.loading = (async () => {
                const [det, cls, rec] = await Promise.all([
                    ort.InferenceSession.create((0, ocr_model_path_1.modelPath)('det')),
                    ort.InferenceSession.create((0, ocr_model_path_1.modelPath)('cls')),
                    ort.InferenceSession.create((0, ocr_model_path_1.modelPath)('rec')),
                ]);
                this.detSession = det;
                this.clsSession = cls;
                this.recSession = rec;
            })().catch((err) => {
                this.loading = undefined;
                throw err;
            });
        }
        await this.loading;
    }
    /** 用空白图跑一遍，把算子初始化成本提前到启动阶段 */
    async warmup() {
        const blank = { data: Buffer.alloc(64 * 64 * 3, 255), width: 64, height: 64 };
        await this.runDet(blank);
        await this.runRec(blank);
    }
    async recognize(input, options = {}) {
        const opts = withDefaults(options);
        await this.ensureLoaded();
        await this.semaphore.acquire();
        const startedAt = Date.now();
        try {
            return await this.recognizeInner(input, opts, startedAt);
        }
        finally {
            this.semaphore.release();
        }
    }
    async recognizeInner(input, opts, startedAt) {
        const original = await (0, image_util_1.decodeToRgb)(input);
        const detSize = (0, image_util_1.calcDetSize)(original.width, original.height, opts.detMaxSide);
        const detImage = await (0, image_util_1.resizeRgb)(original, detSize.width, detSize.height);
        const probMap = await this.runDet(detImage);
        const scaled = (0, det_postprocess_1.scaleBoxes)((0, det_postprocess_1.boxesFromProbMap)(probMap, detSize.width, detSize.height, {
            thresh: opts.detThresh,
            boxThresh: opts.boxThresh,
            unclipRatio: opts.unclipRatio,
        }), original.width / detSize.width, original.height / detSize.height);
        const lines = [];
        for (const raw of scaled) {
            const box = (0, det_postprocess_1.clampBox)(raw, original.width, original.height);
            if (box.x2 - box.x1 < 2 || box.y2 - box.y1 < 2)
                continue;
            let crop = (0, image_util_1.cropRgb)(original, box.x1, box.y1, box.x2, box.y2);
            if (opts.useAngleCls && this.clsSession) {
                const decision = await this.runCls(crop);
                if (decision.flip)
                    crop = (0, image_util_1.rotate180)(crop);
            }
            const { text, score } = await this.runRec(crop);
            if (!text.trim())
                continue;
            lines.push({
                text,
                score,
                points: [
                    [box.x1, box.y1],
                    [box.x2, box.y1],
                    [box.x2, box.y2],
                    [box.x1, box.y2],
                ],
            });
        }
        return {
            lines,
            width: original.width,
            height: original.height,
            elapsedMs: Date.now() - startedAt,
        };
    }
    async runDet(image) {
        const session = this.detSession;
        const tensor = new ort.Tensor('float32', (0, image_util_1.toChwTensor)(image, image_util_1.DET_NORM.mean, image_util_1.DET_NORM.std), [
            1,
            3,
            image.height,
            image.width,
        ]);
        const outputs = await session.run({ x: tensor });
        const out = outputs[session.outputNames[0]];
        return out.data;
    }
    async runCls(crop) {
        const session = this.clsSession;
        const image = await (0, image_util_1.resizeRgb)(crop, image_util_1.CLS_SHAPE.width, image_util_1.CLS_SHAPE.height);
        const tensor = new ort.Tensor('float32', (0, image_util_1.toChwTensor)(image, image_util_1.REC_NORM.mean, image_util_1.REC_NORM.std), [
            1,
            3,
            image.height,
            image.width,
        ]);
        const outputs = await session.run({ x: tensor });
        const out = outputs[session.outputNames[0]];
        return (0, rec_postprocess_1.decideFlip)(out.data);
    }
    async runRec(crop) {
        const session = this.recSession;
        const width = (0, rec_postprocess_1.recInputWidth)(crop.width, crop.height);
        const image = await (0, image_util_1.resizeRgb)(crop, width, image_util_1.REC_HEIGHT);
        const tensor = new ort.Tensor('float32', (0, image_util_1.toChwTensor)(image, image_util_1.REC_NORM.mean, image_util_1.REC_NORM.std), [
            1,
            3,
            image.height,
            image.width,
        ]);
        const outputs = await session.run({ x: tensor });
        const out = outputs[session.outputNames[0]];
        const dims = out.dims;
        const timeSteps = dims[1];
        const numClasses = dims[2];
        return (0, rec_postprocess_1.decodeCtc)(out.data, timeSteps, numClasses);
    }
};
exports.OcrEngine = OcrEngine;
exports.OcrEngine = OcrEngine = __decorate([
    (0, common_1.Injectable)()
], OcrEngine);
