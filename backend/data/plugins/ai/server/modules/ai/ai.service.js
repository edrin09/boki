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
var AiService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const sys_config_entity_1 = require("@core/entities/sys-config.entity");
const ai_providers_1 = require("./ai.providers");
const CONFIG_KEY = 'ai_model';
const DEFAULT_CONFIG = {
    provider: 'ollama',
    baseURL: '',
    apiKey: '',
    model: '',
    enabled: false,
    temperature: 0.2,
    timeoutMs: 15000,
};
/**
 * AI 模型接入（OpenAI 兼容协议，统一走 {baseURL}/chat/completions）。
 *
 * - 配置存 sys_config（系统级，不分公司；凭模型 URL/Key 区分在线 or 自部署）
 * - 未配置 / 失败时调用方一律回退现有规则引擎，服务不受影响
 * - Key 落库存明文（本库即本机数据，未上云）；对外接口一律脱敏
 */
let AiService = AiService_1 = class AiService {
    configRepo;
    logger = new common_1.Logger(AiService_1.name);
    cache;
    constructor(configRepo) {
        this.configRepo = configRepo;
    }
    // ==================== 配置 ====================
    async getConfig() {
        if (this.cache)
            return this.cache;
        const row = await this.configRepo.findOne({ where: { key: CONFIG_KEY } });
        let parsed = {};
        try {
            parsed = row?.value ? JSON.parse(row.value) : {};
        }
        catch {
            this.logger.warn('AI 配置 JSON 解析失败，使用默认配置');
        }
        this.cache = { ...DEFAULT_CONFIG, ...parsed };
        return this.cache;
    }
    /** 对外展示：Key 脱敏 */
    async getConfigView() {
        const cfg = await this.getConfig();
        return {
            ...cfg,
            apiKey: '',
            apiKeyMasked: (0, ai_providers_1.maskKey)(cfg.apiKey),
            ready: this.isReadySync(cfg),
            providers: ai_providers_1.AI_PROVIDERS,
        };
    }
    /**
     * 保存配置。apiKey 传空串表示清除；不传（undefined）保持原值。
     */
    async saveConfig(dto) {
        const current = await this.getConfig();
        const next = { ...current };
        if (dto.provider !== undefined)
            next.provider = (dto.provider || 'custom').trim();
        if (dto.baseURL !== undefined)
            next.baseURL = this.normalizeBaseURL(dto.baseURL);
        if (dto.model !== undefined)
            next.model = (dto.model || '').trim();
        if (dto.enabled !== undefined)
            next.enabled = Boolean(dto.enabled);
        if (dto.temperature !== undefined) {
            next.temperature = Math.min(1, Math.max(0, Number(dto.temperature) || 0));
        }
        if (dto.timeoutMs !== undefined) {
            next.timeoutMs = Math.min(60000, Math.max(3000, Number(dto.timeoutMs) || 15000));
        }
        // apiKey：明文覆盖 / 空串清除 / undefined 保持
        if (dto.apiKey !== undefined)
            next.apiKey = (dto.apiKey || '').trim();
        const preset = ai_providers_1.AI_PROVIDERS.find((p) => p.id === next.provider);
        if (next.enabled) {
            if (!next.baseURL)
                throw new common_1.BadRequestException('请先填写接口地址（Base URL）');
            if (!next.model)
                throw new common_1.BadRequestException('请先填写模型名称');
            if (preset?.keyRequired && !next.apiKey) {
                throw new common_1.BadRequestException(`厂商「${preset.name}」需要填写 API Key`);
            }
        }
        if (next.enabled && preset?.local && isLoopback(next.baseURL) === false) {
            this.logger.warn(`厂商 ${next.provider} 通常为本地地址，当前配置为 ${next.baseURL}`);
        }
        // key 有唯一约束：先查后存，保证重复保存走 UPDATE 而非 INSERT
        const valueJson = JSON.stringify(next);
        const existingRow = await this.configRepo.findOne({ where: { key: CONFIG_KEY } });
        if (existingRow) {
            existingRow.value = valueJson;
            await this.configRepo.save(existingRow);
        }
        else {
            await this.configRepo.save(this.configRepo.create({
                key: CONFIG_KEY,
                value: valueJson,
                remark: 'AI 模型接入配置（OpenAI 兼容）',
            }));
        }
        this.cache = next;
        this.logger.log(`AI 模型配置已保存: provider=${next.provider} model=${next.model} enabled=${next.enabled}`);
        return { message: 'AI 模型设置已保存' };
    }
    /** 是否可服务（保存后的就绪状态 = 开启且必填项完整） */
    isReadySync(cfg) {
        return Boolean(cfg.enabled && cfg.baseURL && cfg.model);
    }
    /** 供其他模块判断：AI 是否已接入 */
    async isReady() {
        return this.isReadySync(await this.getConfig());
    }
    async providerOf(id) {
        return ai_providers_1.AI_PROVIDERS.find((p) => p.id === id);
    }
    normalizeBaseURL(url) {
        return (url || '').trim().replace(/\/+$/, '');
    }
    // ==================== 请求 ====================
    /**
     * 调一次 chat/completions，返回首条回复文本。
     * 任何失败以异常抛出，由调用方决定回退策略。
     */
    async chat(messages, opts) {
        const cfg = await this.getConfig();
        if (!this.isReadySync(cfg))
            throw new common_1.BadRequestException('AI 模型未接入或未开启');
        const url = `${this.normalizeBaseURL(cfg.baseURL)}/chat/completions`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? cfg.timeoutMs);
        try {
            const resp = await fetch(url, {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
                },
                body: JSON.stringify({
                    model: cfg.model,
                    messages,
                    temperature: opts?.temperature ?? cfg.temperature,
                    max_tokens: opts?.maxTokens ?? 512,
                    stream: false,
                }),
            });
            if (!resp.ok) {
                const text = (await resp.text().catch(() => '')) || '';
                throw new Error(`HTTP ${resp.status}${text ? `: ${text.slice(0, 300)}` : ''}`);
            }
            const data = (await resp.json());
            const content = data.choices?.[0]?.message?.content ?? '';
            if (!content.trim())
                throw new Error('模型返回空内容');
            return content.trim();
        }
        catch (err) {
            const message = err?.name === 'AbortError' ? `请求超时（${opts?.timeoutMs ?? cfg.timeoutMs}ms）` : err?.message;
            this.logger.warn(`AI 请求失败: ${message}`);
            throw new common_1.BadRequestException(`AI 请求失败: ${message}`);
        }
        finally {
            clearTimeout(timer);
        }
    }
    /** 设置页「测试连接」 */
    async test() {
        const cfg = await this.getConfig();
        if (!cfg.baseURL || !cfg.model)
            throw new common_1.BadRequestException('请先填写接口地址和模型名称');
        const startedAt = Date.now();
        try {
            await this.chat([{ role: 'user', content: '请原样回复四个字：连接成功' }], {
                maxTokens: 32,
                timeoutMs: Math.min(cfg.timeoutMs, 20000),
            });
            return { ok: true, latencyMs: Date.now() - startedAt, model: cfg.model };
            await this.chat([{ role: 'user', content: '请原样回复四个字：连接成功' }], {
                maxTokens: 32,
                timeoutMs: Math.min(cfg.timeoutMs, 20000),
            });
            return { ok: true, latencyMs: Date.now() - startedAt, model: cfg.model };
        }
        catch (err) {
            throw new common_1.BadRequestException(`连接失败：${err.message}`);
        }
    }
};
exports.AiService = AiService;
exports.AiService = AiService = AiService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(sys_config_entity_1.SysConfig)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], AiService);
/** 是否本地回环地址（用于日志提示，不拦截） */
function isLoopback(url) {
    try {
        const host = new URL(url).hostname;
        return host === 'localhost' || host === '127.0.0.1' || host === '::1';
    }
    catch {
        return false;
    }
}
