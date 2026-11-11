import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
} from '@nestjs/common'
import type { Request } from 'express'
import { requireCompanyId } from '@core/common/company/company-context'
import { RequirePermissions } from '@core/common/decorators/permissions.decorator'
import { Operation } from '@core/common/decorators/operation.decorator'
import { getCurrentUser } from '@core/common/utils/request.util'
import { VoucherStatus } from '@core/common/enums'
import { AiService } from '@plugin/ai/server/modules/ai/ai.service'
import { AiVoiceService } from './ai-voice.service'

/**
 * AI 语音记账对外接口。
 *
 * 读写严格分开：plan 只读，commit 是唯一写库入口且必须带 token + confirmed。
 * 语音识别不在本插件的后端：直接复用 voice 插件的 /api/voice/stream 与
 * /api/voice/transcribe（见 client 说明），本插件只处理文本指令。
 */
@Controller('receipts/voice')
@RequirePermissions('receipts:voice:use')
export class AiVoiceController {
  constructor(
    private readonly service: AiVoiceService,
    private readonly ai: AiService,
  ) {}

  @Get('status')
  @Operation('查询 AI 语音记账状态')
  async status() {
    const aiConfig = await this.ai.getConfig()
    return {
      ready: await this.service.aiReady(),
      ai: {
        ready: Boolean(aiConfig.enabled && aiConfig.baseURL && aiConfig.model),
        provider: aiConfig.provider,
        model: aiConfig.model,
      },
      actions: this.service.capabilities().length,
      /** 语音识别通道由 voice 插件提供（可选依赖）：装了 voice 才有录音入口 */
      voice: {
        plugin: 'voice',
        streamPath: '/api/voice/stream',
        transcribePath: '/api/voice/transcribe',
      },
    }
  }

  @Get('capabilities')
  @Operation('查询 AI 指令动作清单')
  capabilities() {
    return { actions: this.service.capabilities() }
  }

  @Post('plan')
  @HttpCode(HttpStatus.OK)
  @Operation('AI 指令预演（只读，不写库）')
  plan(
    @Body() body: { text?: string; source?: 'voice' | 'text'; today?: string },
    @Req() req: Request,
  ) {
    const text = String(body?.text ?? '')
    if (!text.trim()) throw new BadRequestException('请说一句话，或直接输入指令')
    return this.service.plan({ text, source: body?.source, today: body?.today }, getCurrentUser(req))
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @Operation('AI 指令重新预演（只读，不改令牌）')
  preview(@Body() body: { token?: string; patch?: Record<string, unknown> }, @Req() req: Request) {
    return this.service.refresh(
      { token: String(body?.token ?? ''), patch: body?.patch },
      getCurrentUser(req),
    )
  }

  @Post('commit')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('receipts:voice:commit')
  @Operation('AI 指令确认执行（人工确认后入账）')
  commit(
    @Body() body: { token?: string; patch?: Record<string, unknown>; confirmed?: boolean },
    @Req() req: Request,
  ) {
    return this.service.commit(
      { token: String(body?.token ?? ''), patch: body?.patch, confirmed: body?.confirmed === true },
      getCurrentUser(req),
    )
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('receipts:voice:commit')
  @Operation('取消 AI 指令')
  cancel(@Body() body: { token?: string }, @Req() req: Request) {
    return this.service.cancel(String(body?.token ?? ''), getCurrentUser(req))
  }

  @Get('records')
  @Operation('查询 AI 指令历史')
  records(@Query('limit') limit?: string) {
    return this.service.records(Number(limit) || 30)
  }

  /** 记账台右侧：待人工审核的草稿凭证（审核动作的候选来源） */
  @Get('pending')
  @RequirePermissions('voucher:list')
  @Operation('查询待审核草稿凭证')
  pending(@Query('limit') limit?: string) {
    return this.service.pendingVouchers(Number(limit) || 20)
  }

  /** 供前端展示当前账套信息（调试/占位用，避免前端猜上下文） */
  @Get('context')
  @Operation('查询 AI 指令执行上下文')
  context() {
    return { companyId: requireCompanyId(), voucherDraftStatus: VoucherStatus.DRAFT }
  }
}
