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
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceStreamService = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const jwt_1 = require("@nestjs/jwt");
const voice_asr_service_1 = require("./voice-asr.service");
const voice_stream_server_1 = require("./voice-stream.server");
/**
 * 流式语音识别 WebSocket 挂载。
 *
 * 由插件模块在应用启动完成后自行挂载到同一 HTTP 端口，
 * 内核不再直接依赖语音插件。
 */
let VoiceStreamService = class VoiceStreamService {
    asr;
    jwt;
    adapterHost;
    logger = new common_1.Logger('VoiceWs');
    constructor(asr, jwt, adapterHost) {
        this.asr = asr;
        this.jwt = jwt;
        this.adapterHost = adapterHost;
    }
    onApplicationBootstrap() {
        const httpServer = this.adapterHost.httpAdapter?.getHttpServer();
        if (!httpServer)
            return;
        try {
            (0, voice_stream_server_1.createVoiceStreamServer)(httpServer, this.asr, this.jwt, process.env.APP_PREFIX || 'api', (err) => this.logger.warn(`语音流会话异常: ${err.message}`));
            this.logger.log(`流式识别 WebSocket 就绪：/${process.env.APP_PREFIX || 'api'}/voice/stream`);
        }
        catch (err) {
            this.logger.warn(`语音流服务未启动：${err.message}`);
        }
    }
};
exports.VoiceStreamService = VoiceStreamService;
exports.VoiceStreamService = VoiceStreamService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [voice_asr_service_1.VoiceAsrService,
        jwt_1.JwtService,
        core_1.HttpAdapterHost])
], VoiceStreamService);
