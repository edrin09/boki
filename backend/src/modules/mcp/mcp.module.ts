import { Global, Module } from '@nestjs/common'
import { AccountsModule } from '../accounts/accounts.module'
import { BooksModule } from '../books/books.module'
import { VouchersModule } from '../vouchers/vouchers.module'
import { CoreMcpTools } from './core-mcp-tools'
import { McpController } from './mcp.controller'
import { McpToolRegistry } from './mcp-tool.registry'

export { McpToolRegistry } from './mcp-tool.registry'
export type { McpTool, McpToolContext } from './mcp-tool'
export type { McpToolResult, McpToolDescriptor } from './mcp.types'

/**
 * 只读 MCP 服务（W8）。
 *
 * @Global 是为了让插件能把自己的只读查询（如借款单、报销单列表）
 * 注册进来 —— 注册表在内核，业务实现归插件，与 AI 动作注册表同一套方向。
 */
@Global()
@Module({
  imports: [VouchersModule, AccountsModule, BooksModule],
  controllers: [McpController],
  providers: [McpToolRegistry, CoreMcpTools],
  exports: [McpToolRegistry],
})
export class McpModule {}
