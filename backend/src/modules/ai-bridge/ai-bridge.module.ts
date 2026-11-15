import { Global, Injectable, Logger, Module, OnModuleInit } from '@nestjs/common'
import { AiActionRegistry } from './ai-action.registry'
import { AiDocTypeRegistry } from './doc-type.registry'
import { AiDocTypeConfigService } from './doc-type-config.service'
import { AiDocTypeResolver } from './doc-type.resolver'
import { DocSubmitAction } from './doc-submit.action'
import { TokenStore } from './token.store'

export * from './protocol'
export * from './landing'
export * from './doc-type'
export { AiActionRegistry } from './ai-action.registry'
export { AiDocTypeRegistry } from './doc-type.registry'
export { AiDocTypeConfigService } from './doc-type-config.service'
export { AiDocTypeResolver } from './doc-type.resolver'
export { DocSubmitAction } from './doc-submit.action'
export { TokenStore } from './token.store'
export { AiAuditService } from './audit.service'
export type { AiAuditRecord, AiAuditRecent } from './audit.service'
export type { ResolvedAlias } from './doc-type.resolver'

/** 内核自带动作的注册：目前只有通用单据提交入口 */
@Injectable()
export class CoreAiActions implements OnModuleInit {
  private readonly logger = new Logger('CoreAiActions')

  constructor(
    private readonly registry: AiActionRegistry,
    private readonly docSubmit: DocSubmitAction,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.docSubmit)
    this.logger.log('已注册内核动作 doc.submit')
  }
}

/**
 * AI 操作中间层内核（W1 / W2 / W3 / W7）。
 *
 * 只放「与业务无关、与插件无关」的东西：协议、动作注册表、单据类型注册表
 * 与公司级配置合并层、一次性令牌、草稿闸门。声明为 @Global()，任何插件模块
 * 直接注入即可，不需要 import 任何其它插件（此前动作契约定义在 receipts 内，
 * 别处要用只能反向依赖，方向是错的）。
 *
 * 审计服务不在此注册：它需要插件提供的仓储（表归插件所有），
 * 由插件模块用 useFactory 实例化内核的 `AiAuditService` 类。
 * 单据类型配置表（fin_ai_doc_type / fin_ai_action_alias）则由内核自己持有，
 * 所以配置服务留在这里。
 */
@Global()
@Module({
  providers: [
    AiActionRegistry,
    AiDocTypeRegistry,
    AiDocTypeConfigService,
    AiDocTypeResolver,
    DocSubmitAction,
    TokenStore,
    CoreAiActions,
  ],
  exports: [AiActionRegistry, AiDocTypeRegistry, AiDocTypeResolver, AiDocTypeConfigService, TokenStore],
})
export class AiBridgeModule {}
