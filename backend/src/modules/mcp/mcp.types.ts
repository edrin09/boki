/**
 * MCP（Model Context Protocol）最小实现所需的类型（W8）。
 *
 * 只实现「服务端暴露只读工具」这一条路径：JSON-RPC 2.0 over HTTP POST。
 * 不实现 sampling / resources / prompts —— 本项目不需要，也不该让外部
 * AI 通过协议反向驱动业务写操作。
 */

export const MCP_PROTOCOL_VERSION = '2024-11-05'

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcSuccess {
  jsonrpc: '2.0'
  id: string | number | null
  result: unknown
}

export interface JsonRpcFailure {
  jsonrpc: '2.0'
  id: string | number | null
  error: { code: number; message: string; data?: unknown }
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure

/** JSON-RPC 错误码 */
export const RpcError = {
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
} as const

/** MCP 工具调用结果（content 数组是协议规定结构） */
export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
  /** 结构化结果（新版协议字段，供客户端二次解析；老客户端忽略即可） */
  structuredContent?: unknown
}

export interface McpToolDescriptor {
  name: string
  title?: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
    additionalProperties?: boolean
  }
  annotations?: {
    /** 只读提示：客户端据此决定是否需要用户确认 */
    readOnlyHint?: boolean
    title?: string
  }
}
