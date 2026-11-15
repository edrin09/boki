import { Body, Controller, Get, HttpCode, Logger, Post, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import { ForbiddenException } from '@nestjs/common'
import { requireCompanyId } from '../../common/company/company-context'
import { SkipWrap } from '../../common/decorators/skip-wrap.decorator'
import { getCurrentUser } from '../../common/utils/request.util'
import { McpToolRegistry } from './mcp-tool.registry'
import { MCP_PROTOCOL_VERSION, RpcError } from './mcp.types'
import type { JsonRpcRequest, JsonRpcResponse, McpToolResult } from './mcp.types'

/**
 * 只读 MCP 服务端（W8）。
 *
 * 协议面：JSON-RPC 2.0 over HTTP POST（MCP 的 streamable HTTP 传输中
 * 最核心的一条路径）。实现的方法只有 initialize / tools/list / tools/call / ping，
 * 不实现 resources / prompts / sampling —— 本服务对外只提供「查询」。
 *
 * 安全边界：
 * - 走全局 JWT 守卫，身份与账套与网页端完全一致；
 * - 工具自带 permission，调用时按当前用户再校验一次；
 * - 注册表只接受 readOnly: true 的工具，写动作进不来。
 */
@Controller('mcp')
export class McpController {
  private readonly logger = new Logger('Mcp')

  constructor(private readonly registry: McpToolRegistry) {}

  /** 有些客户端会先 GET 探测 SSE 通道：明确告诉它本服务只用 POST */
  @Get()
  @SkipWrap()
  probe(@Res() res: Response): void {
    res.status(405).json({
      jsonrpc: '2.0',
      error: {
        code: RpcError.INVALID_REQUEST,
        message: '本服务只支持 POST JSON-RPC（只读工具，无 SSE 通道）',
      },
    })
  }

  @Post()
  @HttpCode(200)
  @SkipWrap()
  async rpc(
    @Body() body: JsonRpcRequest | JsonRpcRequest[],
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<JsonRpcResponse | JsonRpcResponse[] | undefined> {
    if (Array.isArray(body)) {
      const out: JsonRpcResponse[] = []
      for (const item of body) {
        const one = await this.handle(item, req)
        if (one) out.push(one)
      }
      // 全是通知时按协议返回 202 空体
      if (!out.length) {
        res.status(202)
        return undefined
      }
      return out
    }

    const one = await this.handle(body, req)
    if (!one) {
      res.status(202)
      return undefined
    }
    return one
  }

  // ==================== 分发 ====================

  private async handle(raw: JsonRpcRequest, req: Request): Promise<JsonRpcResponse | null> {
    if (!raw || raw.jsonrpc !== '2.0' || typeof raw.method !== 'string') {
      return this.fail(raw?.id ?? null, RpcError.INVALID_REQUEST, '请求不是合法的 JSON-RPC 2.0')
    }

    // 通知（无 id）：执行但不必回包
    const isNotification = raw.id === undefined || raw.id === null

    try {
      const result = await this.dispatch(raw, req)
      if (isNotification) return null
      return { jsonrpc: '2.0', id: raw.id ?? null, result }
    } catch (err) {
      const message = (err as Error).message ?? '调用失败'
      if (isNotification) return null
      // 权限不足按 JSON-RPC error 返回，客户端能直接展示
      if (err instanceof ForbiddenException) {
        return this.fail(raw.id ?? null, RpcError.INVALID_REQUEST, message)
      }
      return this.fail(raw.id ?? null, RpcError.INTERNAL, message)
    }
  }

  private async dispatch(raw: JsonRpcRequest, req: Request): Promise<unknown> {
    switch (raw.method) {
      case 'initialize':
        return {
          // 回显客户端要求的版本，兼容不同版本的客户端
          protocolVersion: String((raw.params?.protocolVersion as string) ?? MCP_PROTOCOL_VERSION),
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'boki', version: '1.0.0' },
          instructions:
            '本服务只提供只读查询（凭证、科目、余额、账簿）。所有工具都不会修改数据；如需记账请用网页端或 AI 指令面板。',
        }

      case 'notifications/initialized':
      case 'notifications/cancelled':
        return {}

      case 'ping':
        return {}

      case 'tools/list':
        return { tools: this.registry.descriptors() }

      case 'tools/call': {
        const name = String((raw.params?.name as string) ?? '').trim()
        const tool = this.registry.get(name)
        if (!tool) throw new Error(`工具不存在：${name || '(空)'}`)
        const user = getCurrentUser(req)
        this.assertPermission(user, tool.permission, tool.title)
        const args = (raw.params?.arguments ?? {}) as Record<string, unknown>
        const out = await tool.call(args, {
          user,
          companyId: requireCompanyId(),
          source: 'mcp',
        })
        this.logger.log(`tools/call ${name} by ${user?.username ?? '?'}`)
        return this.toResult(out)
      }

      default:
        throw new Error(`不支持的方法：${raw.method}`)
    }
  }

  // ==================== 内部 ====================

  private assertPermission(user: any, code: string | undefined, title: string): void {
    if (!code) return
    const roles: string[] = user?.roles ?? []
    if (roles.includes('admin')) return
    const owned: string[] = user?.permissions ?? []
    if (!owned.includes(code)) {
      throw new ForbiddenException(`无权限使用「${title}」，需要权限：${code}`)
    }
  }

  /** 工具可以直接返回字符串/对象，也可以返回已组装好的 MCP 结果 */
  private toResult(out: unknown): McpToolResult {
    if (out && typeof out === 'object' && Array.isArray((out as McpToolResult).content)) {
      return out as McpToolResult
    }
    return {
      content: [
        {
          type: 'text',
          text: typeof out === 'string' ? out : JSON.stringify(out ?? null),
        },
      ],
    }
  }

  private fail(id: string | number | null, code: number, message: string): JsonRpcResponse {
    return { jsonrpc: '2.0', id, error: { code, message } }
  }
}
