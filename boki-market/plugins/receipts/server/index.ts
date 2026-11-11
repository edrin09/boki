import { ReceiptsModule } from './modules/receipts/receipts.module'
import { AiVoiceAudit } from './modules/voice-ops/bridge/entities/ai-voice-audit.entity'

export const module = ReceiptsModule

// 票据/归类规则实体过渡期仍由内核提供，后续再迁入本插件；
// 语音指令审计表随原 ai-voice 插件并入，由本插件自带。
export const entities = [AiVoiceAudit]
