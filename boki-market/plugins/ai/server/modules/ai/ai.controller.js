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
exports.AiController = void 0;
const common_1 = require("@nestjs/common");
const permissions_decorator_1 = require("@core/common/decorators/permissions.decorator");
const operation_decorator_1 = require("@core/common/decorators/operation.decorator");
const ai_service_1 = require("./ai.service");
let AiController = class AiController {
    ai;
    constructor(ai) {
        this.ai = ai;
    }
    /** 登录即可查：语音助手前端据此展示「AI 增强」徽标 */
    async status() {
        const cfg = await this.ai.getConfig();
        return {
            ready: await this.ai.isReady(),
            provider: cfg.provider,
            model: cfg.model,
        };
    }
    config() {
        return this.ai.getConfigView();
    }
    save(dto) {
        return this.ai.saveConfig(dto);
    }
    test() {
        return this.ai.test();
    }
};
exports.AiController = AiController;
__decorate([
    (0, common_1.Get)('status'),
    (0, operation_decorator_1.Operation)('查询 AI 接入状态'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AiController.prototype, "status", null);
__decorate([
    (0, common_1.Get)('config'),
    (0, permissions_decorator_1.RequirePermissions)('system:ai-config'),
    (0, operation_decorator_1.Operation)('查询 AI 模型设置（Key 脱敏）'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AiController.prototype, "config", null);
__decorate([
    (0, common_1.Put)('config'),
    (0, permissions_decorator_1.RequirePermissions)('system:ai-config'),
    (0, operation_decorator_1.Operation)('保存 AI 模型设置'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "save", null);
__decorate([
    (0, common_1.Post)('test'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('system:ai-config'),
    (0, operation_decorator_1.Operation)('测试 AI 模型连接'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AiController.prototype, "test", null);
exports.AiController = AiController = __decorate([
    (0, common_1.Controller)('ai'),
    __metadata("design:paramtypes", [ai_service_1.AiService])
], AiController);
