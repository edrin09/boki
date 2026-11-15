import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { AccountsService } from '../accounts/accounts.service'
import { BooksService } from '../books/books.service'
import { VouchersService } from '../vouchers/vouchers.service'
import type { McpTool, McpToolContext } from './mcp-tool'
import { McpToolRegistry } from './mcp-tool.registry'
import type { McpToolResult } from './mcp.types'

/** 单次返回行数上限：外部 AI 的上下文很贵，宁可让它翻页也不要一次塞几千行 */
const MAX_ROWS = 100

/**
 * 内核自带的只读工具（W8）。
 *
 * 覆盖「查账、查余额、查凭证、查科目」四类最常用的读需求。
 * 业务单据（借款单 / 报销单）的查询由归属插件自行注册，内核不认识它们。
 */
@Injectable()
export class CoreMcpTools implements OnModuleInit {
  private readonly logger = new Logger('CoreMcpTools')

  constructor(
    private readonly registry: McpToolRegistry,
    private readonly vouchers: VouchersService,
    private readonly accounts: AccountsService,
    private readonly books: BooksService,
  ) {}

  onModuleInit(): void {
    this.registry.registerAll([
      this.voucherSearch(),
      this.voucherGet(),
      this.accountSearch(),
      this.accountBalance(),
      this.trialBalance(),
      this.ledgerDetail(),
    ])
    this.logger.log(`内核只读工具注册完成，共 ${this.registry.size} 个`)
  }

  // ==================== 凭证 ====================

  private voucherSearch(): McpTool {
    return {
      readOnly: true,
      name: 'voucher.search',
      title: '查询凭证',
      description:
        '按期间/状态/关键字分页查询记账凭证，返回凭证号、日期、摘要、金额、状态。只读，不会修改任何数据。',
      permission: 'voucher:list',
      inputSchema: {
        type: 'object',
        properties: {
          period: { type: 'integer', description: '会计期间 YYYYMM，如 202611' },
          startPeriod: { type: 'integer', description: '起始期间 YYYYMM（与 endPeriod 配对）' },
          endPeriod: { type: 'integer', description: '结束期间 YYYYMM' },
          status: { type: 'string', enum: ['draft', 'approved', 'void'], description: '凭证状态' },
          // 服务端有两个不同的过滤口径：word 是「凭证字」精确匹配，
          // keyword 才是摘要/科目模糊匹配。早先把摘要搜索接到 word 上，
          // 调用方按描述传摘要会一直查到 0 条。
          word: { type: 'string', description: '凭证字（记 / 收 / 付），精确匹配' },
          keyword: { type: 'string', description: '摘要或科目模糊匹配，如「差旅费」' },
          page: { type: 'integer', minimum: 1, description: '页码，默认 1' },
          pageSize: { type: 'integer', minimum: 1, maximum: MAX_ROWS, description: '每页条数，默认 20' },
        },
        additionalProperties: false,
      },
      call: async (args, ctx) => {
        const page = await this.vouchers.findAll({
          page: int(args.page, 1),
          pageSize: Math.min(int(args.pageSize, 20), MAX_ROWS),
          ...(int(args.period) ? { period: int(args.period) } : {}),
          ...(int(args.startPeriod) ? { startPeriod: int(args.startPeriod) } : {}),
          ...(int(args.endPeriod) ? { endPeriod: int(args.endPeriod) } : {}),
          ...(str(args.status) ? { status: str(args.status) } : {}),
          ...(str(args.word) ? { word: str(args.word) } : {}),
          ...(str(args.keyword) ? { keyword: str(args.keyword) } : {}),
        })
        return ok(`共 ${page.total} 张凭证，本页 ${page.list.length} 张`, {
          total: page.total,
          page: page.page,
          pageSize: page.pageSize,
          items: (page.list ?? []).map((v: any) => ({
            id: v.id,
            voucherNo: v.voucherNo,
            voucherDate: v.voucherDate,
            period: v.period,
            // 列表 VO 里摘要叫 remark、金额是借贷合计 debitTotal；
            // 直接读 summary/amount 会永远拿到 undefined，客户端看到的是空摘要 0 元。
            summary: v.remark ?? v.summary ?? '',
            amount: Number(v.debitTotal ?? v.amount ?? 0),
            status: v.status,
          })),
        })
      },
    }
  }

  private voucherGet(): McpTool {
    return {
      readOnly: true,
      name: 'voucher.get',
      title: '查看凭证详情',
      description: '按凭证 ID 查询一张凭证的完整分录（科目、借贷金额、辅助核算）。只读。',
      permission: 'voucher:list',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', description: '凭证 ID' } },
        required: ['id'],
        additionalProperties: false,
      },
      call: async (args) => {
        const id = str(args.id)
        if (!id) throw new Error('缺少凭证 ID')
        const voucher = await this.vouchers.findOne(id)
        return ok(`凭证 ${voucher?.voucherNo ?? id}`, voucher)
      },
    }
  }

  // ==================== 科目与余额 ====================

  private accountSearch(): McpTool {
    return {
      readOnly: true,
      name: 'account.search',
      title: '查询会计科目',
      description: '按关键字/类别查询会计科目（编码、名称、级次、方向），用于确定科目编码。只读。',
      permission: 'books:balance',
      inputSchema: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '编码或名称关键字，如 应收账款 / 1122' },
          category: {
            type: 'string',
            enum: ['asset', 'liability', 'equity', 'cost', 'income', 'expense'],
            description: '科目类别',
          },
          limit: { type: 'integer', minimum: 1, maximum: MAX_ROWS, description: '返回条数，默认 50' },
        },
        additionalProperties: false,
      },
      call: async (args) => {
        const keyword = str(args.keyword).toLowerCase()
        const category = str(args.category)
        const limit = Math.min(int(args.limit, 50), MAX_ROWS)
        const rows = (await this.accounts.findLeafOptions({ status: 1 })) as any[]
        const hit = rows
          .filter((a) => (category ? a.category === category : true))
          .filter((a) =>
            keyword
              ? String(a.code).toLowerCase().includes(keyword) ||
                String(a.name ?? '').toLowerCase().includes(keyword) ||
                String(a.fullName ?? '').toLowerCase().includes(keyword)
              : true,
          )
          .slice(0, limit)
        return ok(`匹配 ${hit.length} 个明细科目`, {
          items: hit.map((a) => ({
            id: a.id,
            code: a.code,
            name: a.name,
            fullName: a.fullName,
            category: a.category,
            direction: a.direction,
            // 明细科目下拉里辅助核算字段叫 auxiliaryTypes，写 aux 会全是 undefined
            aux: a.auxiliaryTypes ?? a.aux ?? [],
          })),
        })
      },
    }
  }

  private accountBalance(): McpTool {
    return {
      readOnly: true,
      name: 'account.balance',
      title: '查询科目余额',
      description:
        '查询指定期间的科目余额表（期初、本期借贷发生额、期末余额）。可按科目编码过滤，不传则返回有金额的全部明细科目。只读。',
      permission: 'books:balance',
      inputSchema: {
        type: 'object',
        properties: {
          period: { type: 'integer', description: '期间 YYYYMM；不传默认本期' },
          startPeriod: { type: 'integer', description: '起始期间 YYYYMM' },
          endPeriod: { type: 'integer', description: '结束期间 YYYYMM' },
          codes: {
            type: 'array',
            items: { type: 'string' },
            description: '科目编码列表，如 ["1122","6001"]；不传返回全部',
          },
          onlyLeaf: { type: 'boolean', description: '仅明细科目，默认 true' },
          limit: { type: 'integer', minimum: 1, maximum: MAX_ROWS, description: '返回行数上限，默认 100' },
        },
        additionalProperties: false,
      },
      call: async (args) => {
        const period = int(args.period)
        const startPeriod = int(args.startPeriod) || period
        const endPeriod = int(args.endPeriod) || period
        const codes = Array.isArray(args.codes) ? args.codes.map((c) => str(c)).filter(Boolean) : []
        const onlyLeaf = args.onlyLeaf !== false
        const limit = Math.min(int(args.limit, MAX_ROWS), MAX_ROWS)

        const table = await this.books.balanceTable({
          ...(startPeriod ? { startPeriod } : {}),
          ...(endPeriod ? { endPeriod } : {}),
          ...(codes.length ? { accountCodes: codes } : {}),
        })
        const rows = (table?.rows ?? []).filter((r: any) => (onlyLeaf ? r.level > 1 || r.isLeaf : true))
        return ok(`期间 ${table?.startPeriod}-${table?.endPeriod}，返回 ${Math.min(rows.length, limit)} 行`, {
          startPeriod: table?.startPeriod,
          endPeriod: table?.endPeriod,
          rows: rows.slice(0, limit).map((r: any) => ({
            code: r.code,
            name: r.name,
            openingDebit: r.openingDebit,
            openingCredit: r.openingCredit,
            periodDebit: r.periodDebit,
            periodCredit: r.periodCredit,
            closingDebit: r.closingDebit,
            closingCredit: r.closingCredit,
          })),
        })
      },
    }
  }

  private trialBalance(): McpTool {
    return {
      readOnly: true,
      name: 'books.trial_balance',
      title: '查询试算平衡表',
      description: '查询一级科目的试算平衡表（期初、发生额、期末的借贷合计）。只读。',
      permission: 'books:trial-balance',
      inputSchema: {
        type: 'object',
        properties: {
          period: { type: 'integer', description: '期间 YYYYMM' },
          startPeriod: { type: 'integer', description: '起始期间 YYYYMM' },
          endPeriod: { type: 'integer', description: '结束期间 YYYYMM' },
        },
        additionalProperties: false,
      },
      call: async (args) => {
        const period = int(args.period)
        const data = await this.books.trialBalance({
          ...(int(args.startPeriod) ? { startPeriod: int(args.startPeriod) } : period ? { startPeriod: period } : {}),
          ...(int(args.endPeriod) ? { endPeriod: int(args.endPeriod) } : period ? { endPeriod: period } : {}),
        })
        return ok(`试算平衡 ${data?.startPeriod}-${data?.endPeriod}`, data)
      },
    }
  }

  private ledgerDetail(): McpTool {
    return {
      readOnly: true,
      name: 'books.ledger',
      title: '查询明细账',
      description:
        '查询某个科目的明细账（逐笔发生额与余额）。accountCode 与 accountId 传一个即可。只读。',
      permission: 'books:ledger',
      inputSchema: {
        type: 'object',
        properties: {
          accountCode: { type: 'string', description: '科目编码，如 1122' },
          accountId: { type: 'string', description: '科目 ID（与 accountCode 二选一）' },
          startPeriod: { type: 'integer', description: '起始期间 YYYYMM' },
          endPeriod: { type: 'integer', description: '结束期间 YYYYMM' },
          includeUnapproved: { type: 'boolean', description: '是否包含未审核凭证，默认 false' },
        },
        required: [],
        additionalProperties: false,
      },
      call: async (args, ctx) => {
        const id = str(args.accountId) || (await this.accountIdOf(str(args.accountCode), ctx))
        if (!id) throw new Error('请提供 accountCode 或 accountId')
        const data = await this.books.ledger({
          accountId: id,
          ...(int(args.startPeriod) ? { startPeriod: int(args.startPeriod) } : {}),
          ...(int(args.endPeriod) ? { endPeriod: int(args.endPeriod) } : {}),
          ...(args.includeUnapproved === true ? { includeUnapproved: true } : {}),
        })
        return ok(`明细账 ${data?.account?.code ?? ''} ${data?.account?.name ?? ''}`, data)
      },
    }
  }

  private async accountIdOf(code: string, _ctx: McpToolContext): Promise<string> {
    if (!code) return ''
    const account = await this.accounts.findByCode(code)
    if (!account) throw new Error(`科目编码不存在：${code}`)
    return account.id
  }
}

// ==================== 小工具 ====================

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value === undefined || value === null ? '' : String(value).trim()
}

function int(value: unknown, fallback = 0): number {
  const num = Number(str(value))
  return Number.isFinite(num) && num > 0 ? Math.trunc(num) : fallback
}

/** 统一包装成 MCP 的 content 结构：既给文本，也给结构化数据 */
function ok(summary: string, data: unknown): McpToolResult {
  return {
    content: [{ type: 'text', text: `${summary}\n${JSON.stringify(data)}` }],
    structuredContent: { summary, data },
  }
}
