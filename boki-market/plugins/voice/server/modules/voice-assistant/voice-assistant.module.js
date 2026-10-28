"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceAssistantModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const voucher_entity_1 = require("@core/entities/voucher.entity");
const bank_account_entity_1 = require("@core/entities/bank-account.entity");
const account_entity_1 = require("@core/entities/account.entity");
const hr_entity_1 = require("@core/entities/hr.entity");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
const reports_module_1 = require("@plugin/report-pack/server/modules/reports/reports.module");
const books_module_1 = require("@core/modules/books/books.module");
const ai_module_1 = require("@plugin/ai/server/modules/ai/ai.module");
const voice_assistant_controller_1 = require("./voice-assistant.controller");
const voice_asr_service_1 = require("./voice-asr.service");
const voice_query_service_1 = require("./voice-query.service");
const voice_stream_service_1 = require("./voice-stream.service");
const ai_agent_service_1 = require("./ai-agent.service");
let VoiceAssistantModule = class VoiceAssistantModule {
};
exports.VoiceAssistantModule = VoiceAssistantModule;
exports.VoiceAssistantModule = VoiceAssistantModule = __decorate([
    (0, common_1.Module)({
        imports: [
            // 语音助手是“只读聚合”模块：复用现有查询服务与只读仓储，
            // 不依赖 hr 插件，也不引入新数据的写入路径
            reports_module_1.ReportsModule,
            books_module_1.BooksModule,
            ai_module_1.AiModule,
            typeorm_1.TypeOrmModule.forFeature([voucher_entity_1.Voucher, bank_account_entity_1.BankAccount, account_entity_1.Account, hr_entity_1.Loan, hr_entity_1.ExpenseClaim]),
        ],
        controllers: [voice_assistant_controller_1.VoiceAssistantController],
        providers: [
            voice_asr_service_1.VoiceAsrService,
            voice_query_service_1.VoiceQueryService,
            voice_stream_service_1.VoiceStreamService,
            ai_agent_service_1.AiAgentService,
            ...(0, company_repo_decorator_1.companyRepoProviders)(voucher_entity_1.Voucher, bank_account_entity_1.BankAccount, account_entity_1.Account, hr_entity_1.Loan, hr_entity_1.ExpenseClaim),
        ],
        exports: [voice_query_service_1.VoiceQueryService],
    })
], VoiceAssistantModule);
