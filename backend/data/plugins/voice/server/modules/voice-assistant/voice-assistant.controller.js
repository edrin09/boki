"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceAssistantController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const permissions_decorator_1 = require("@core/common/decorators/permissions.decorator");
const operation_decorator_1 = require("@core/common/decorators/operation.decorator");
const ai_service_1 = require("@plugin/ai/server/modules/ai/ai.service");
const voice_asr_service_1 = require("./voice-asr.service");
const voice_query_service_1 = require("./voice-query.service");
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const AUDIO_MIME = /^(audio|multipart|application\/octet-stream)/i;
const audioUpload = (0, platform_express_1.FileInterceptor)('audio', {
    storage: (0, multer_1.memoryStorage)(),
    defParamCharset: 'utf8',
    limits: { fileSize: MAX_UPLOAD_BYTES },
});
let VoiceAssistantController = class VoiceAssistantController {
    asr;
    voiceQuery;
    ai;
    constructor(asr, voiceQuery, ai) {
        this.asr = asr;
        this.voiceQuery = voiceQuery;
        this.ai = ai;
    }
    async status() {
        return {
            ...this.asr.status(),
            /** AI 增强：已接入大模型时自由说法走语义理解，未接入走关键词匹配 */
            ai: await this.ai.getConfig().then((c) => ({
                ready: Boolean(c.enabled && c.baseURL && c.model),
                provider: c.provider,
                model: c.model,
            })),
            /** 前端 FAB 可见性：模型未就绪仍可用文字输入（Plan B） */
            textFallbackAvailable: true,
        };
    }
    async query(file, text) {
        let transcript = (text ?? '').trim();
        if (file) {
            if (!AUDIO_MIME.test(file.mimetype ?? '')) {
                throw new common_1.BadRequestException(`暂不支持的音频类型: ${file.mimetype}`);
            }
            const asrResult = await this.asr.recognize(file.buffer);
            transcript = asrResult.text;
            if (!transcript) {
                throw new common_1.BadRequestException('没有听清内容，请靠近一点再试，也可以直接打字');
            }
        }
        if (!transcript) {
            throw new common_1.BadRequestException('请说话或在输入框输入指令');
        }
        return this.voiceQuery.runText(transcript);
    }
    async transcribe(file) {
        if (!file)
            throw new common_1.BadRequestException('请提供录音文件');
        if (!AUDIO_MIME.test(file.mimetype ?? '')) {
            throw new common_1.BadRequestException(`暂不支持的音频类型: ${file.mimetype}`);
        }
        const asrResult = await this.asr.recognize(file.buffer);
        return { text: asrResult.text };
    }
    download(exportId, res) {
        const found = this.voiceQuery.downloadExport(exportId);
        if (!found) {
            throw new common_1.BadRequestException('导出已过期或不存在，请重新提问');
        }
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        // 文件名 decode 后放入 UTF-8 编码的 attachment，避免中文乱码
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(found.filename)}`);
        res.send(found.buffer);
    }
};
exports.VoiceAssistantController = VoiceAssistantController;
__decorate([
    (0, common_1.Get)('status'),
    (0, operation_decorator_1.Operation)('查询语音助手状态（ASR / AI 增强就绪情况/ AI 增强就绪情况）'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], VoiceAssistantController.prototype, "status", null);
__decorate([
    (0, common_1.Post)('query'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UseInterceptors)(audioUpload),
    (0, operation_decorator_1.Operation)('语音提问：识别 → 意图 → 查询 → Excel → 话术'),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Body)('text')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], VoiceAssistantController.prototype, "query", null);
__decorate([
    (0, common_1.Post)('transcribe'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UseInterceptors)(audioUpload),
    (0, operation_decorator_1.Operation)('语音转写：只识别文字，不执行查询（松开空格后填入输入框）'),
    __param(0, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], VoiceAssistantController.prototype, "transcribe", null);
__decorate([
    (0, common_1.Get)('export/:exportId'),
    (0, operation_decorator_1.Operation)('下载语音查询生成的 Excel'),
    __param(0, (0, common_1.Param)('exportId')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], VoiceAssistantController.prototype, "download", null);
exports.VoiceAssistantController = VoiceAssistantController = __decorate([
    (0, common_1.Controller)('voice'),
    (0, permissions_decorator_1.RequirePermissions)('voice:use'),
    __metadata("design:paramtypes", [voice_asr_service_1.VoiceAsrService,
        voice_query_service_1.VoiceQueryService,
        ai_service_1.AiService])
], VoiceAssistantController);
