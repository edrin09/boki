import { Injectable, Logger } from '@nestjs/common'
import type { McpTool } from './mcp-tool'
import type { McpToolDescriptor } from './mcp.types'

/**
 * 只读 MCP 工具注册表。
 *
 * 与 `AiActionRegistry` 对称：内核与插件都往里注册，
 * 但这里只收 `readOnly: true` 的工具，写动作一个都进不来。
 */
@Injectable()
export class McpToolRegistry {
  private readonly logger = new Logger('McpToolRegistry')
  private readonly tools = new Map<string, McpTool>()

  register(tool: McpTool): void {
    if (!tool) return
    if (tool.readOnly !== true) {
      throw new Error(`MCP 工具「${tool?.name ?? '?'}」必须声明 readOnly: true`)
    }
    const name = String(tool.name ?? '').trim()
    if (!/^[a-z][a-z0-9_.]*$/.test(name)) {
      throw new Error(`MCP 工具名不合法：${name}（要求小写点分，如 voucher.search）`)
    }
    if (!tool.description) throw new Error(`MCP 工具「${name}」缺少描述`)
    if (!tool.inputSchema || tool.inputSchema.type !== 'object') {
      throw new Error(`MCP 工具「${name}」的 inputSchema 必须是 object`)
    }
    if (this.tools.has(name)) {
      this.logger.warn(`MCP 工具「${name}」重复注册，已忽略后者`)
      return
    }
    this.tools.set(name, tool)
    this.logger.log(`已注册只读工具 ${name}`)
  }

  registerAll(tools: McpTool[]): void {
    for (const tool of tools) this.register(tool)
  }

  get(name: string): McpTool | undefined {
    return this.tools.get(String(name ?? '').trim())
  }

  list(): McpTool[] {
    return [...this.tools.values()]
  }

  descriptors(): McpToolDescriptor[] {
    return this.list().map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: { readOnlyHint: true, title: tool.title },
    }))
  }

  get size(): number {
    return this.tools.size
  }
}
