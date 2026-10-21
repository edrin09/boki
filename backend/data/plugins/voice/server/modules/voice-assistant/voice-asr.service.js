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
exports.VoiceAsrService = void 0;
const common_1 = require("@nestjs/common");
const sherpa = __importStar(require("sherpa-onnx-node"));
const asr_model_path_1 = require("./asr-model.path");
const wav_utils_1 = require("./wav.utils");
/**
 * 流式语音识别（sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30）。
 *
 * - 在线识别器：WebSocket 会话逐帧喂 16k PCM，逐字吐部分结果（partial）
 * - REST 整段转写：同一个识别器单流灌整段音频取终稿（query/transcribe 复用）
 * - 懒加载 + 失败可重试（模型补齐后无需重启进程）
 */
let VoiceAsrService = class VoiceAsrService {
    logger = new common_1.Logger('VoiceAsr');
    recognizer;
    loaded = false;
    lastError;
    isReady() {
        return Boolean(this.recognizer);
    }
    status() {
        return {
            ready: this.isReady(),
            modelDir: (0, asr_model_path_1.resolveAsrModelDir)(),
            missing: (0, asr_model_path_1.missingAsrModels)(),
            error: this.lastError,
        };
    }
    async ensureLoaded() {
        if (this.recognizer)
            return this.recognizer;
        if (!(0, asr_model_path_1.asrReady)()) {
            return Promise.reject(new Error(`ASR 模型未就绪，缺失: ${(0, asr_model_path_1.missingAsrModels)().join(', ')}，目录: ${(0, asr_model_path_1.resolveAsrModelDir)()}`));
        }
        if (this.loaded) {
            // 上次构造失败后模型文件已补齐，重试构造
            this.loaded = false;
        }
        if (!this.loading) {
            this.loopLog(`开始加载流式 ASR 模型: ${(0, asr_model_path_1.resolveAsrModelDir)()}`);
            this.loading = this.doLoad();
        }
        return this.loading;
    }
    loading;
    async doLoad() {
        try {
            const recognizer = new sherpa.OnlineRecognizer({
                modelConfig: {
                    transducer: {
                        encoder: (0, asr_model_path_1.asrModelPath)('encoder'),
                        decoder: (0, asr_model_path_1.asrModelPath)('decoder'),
                        joiner: (0, asr_model_path_1.asrModelPath)('joiner'),
                    },
                    tokens: (0, asr_model_path_1.asrModelPath)('tokens'),
                    numThreads: 2,
                    provider: 'cpu',
                    debug: 0,
                },
                decodingMethod: 'greedy_search',
                enableEndpointDetection: true,
                rule1MinTrailingSilence: 2.25,
                rule2MinTrailingSilence: 1.2,
                rule3MinUtteranceLength: 15,
            });
            this.recognizer = recognizer;
            this.loaded = true;
            this.lastError = undefined;
            this.logger.log('流式 ASR 模型加载完成');
            return recognizer;
        }
        catch (err) {
            this.loading = undefined;
            this.lastError = err.message;
            throw err;
        }
    }
    loopLog(message) {
        this.logger.log(message);
    }
    /**
     * 开启一个流式识别会话（WebSocket 用）。
     * accept 喂 16k Float32 段；partial() 返回当前已识别文本；finish() 取终稿。
     */
    async openStream() {
        const recognizer = await this.ensureLoaded();
        const native = recognizer.createStream();
        const drain = () => {
            while (recognizer.isReady(native))
                recognizer.decode(native);
            return recognizer.getResult(native)?.text ?? '';
        };
        return {
            accept: (samples) => {
                native.acceptWaveform({ samples, sampleRate: 16000 });
                drain();
            },
            partial: () => drain(),
            finish: () => {
                native.inputFinished();
                while (recognizer.isReady(native))
                    recognizer.decode(native);
                return recognizer.getResult(native)?.text ?? '';
            },
            destroy: () => {
                void native;
            },
        };
    }
    /** 整段 WAV（PCM16/Float32，任意采样率）→ 终稿文本。REST 接口用。 */
    async recognize(wavBuffer) {
        const recognizer = await this.ensureLoaded();
        const startedAt = Date.now();
        const { samples } = (0, wav_utils_1.parseWav)(wavBuffer);
        const stream = recognizer.createStream();
        stream.acceptWaveform({ samples, sampleRate: 16000 });
        while (recognizer.isReady(stream))
            recognizer.decode(stream);
        const result = recognizer.getResult(stream);
        const text = (result?.text ?? '').trim();
        return {
            text,
            latencyMs: Date.now() - startedAt,
            modelLoaded: true,
        };
    }
};
exports.VoiceAsrService = VoiceAsrService;
exports.VoiceAsrService = VoiceAsrService = __decorate([
    (0, common_1.Injectable)()
], VoiceAsrService);
