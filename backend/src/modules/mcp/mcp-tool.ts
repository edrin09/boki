import type { CurrentUser } from '../../common/interfaces/jwt-payload.interface'
import type { McpToolDescriptor, McpToolResult } from './mcp.types'

/** 工具执行上下文：只给读上下文，不给任何写能力入口 */
export interface McpToolContext {
  user: CurrentUser
  companyId: string
  /** 调用来源（审计/日志用） */
  source: string
}

/**
 * 只读工具契约（W8）。
 *
 * 硬约束：`readOnly` 必须是字面量 `true`，注册表会校验。
 * 工具实现只允许调用业务模块的**查询**方法（find / compute / balance 等），
 * 不得调用 create / update / remove / approve —— MCP 这条链路上不存在
 * 「让外部 AI 改账」的可能性。
 */
export interface McpTool {
  readonly readOnly: true
  /** 工具名：小写，点分命名空间，如 voucher.search */
  readonly name: string
  /** 展示名（中文），客户端工具选择列表里显示 */
  readonly title: string
  readonly description: string
  /** 需要的业务权限码；调用时按当前用户校验，admin 直接放行 */
  readonly permission?: string
  readonly inputSchema: McpToolDescriptor['inputSchema']
  call(args: Record<string, unknown>, ctx: McpToolContext): Promise<McpToolResult | unknown>
}
