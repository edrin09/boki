import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put } from '@nestjs/common'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { Operation } from '../../common/decorators/operation.decorator'
import { AiService } from './ai.service'

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  /** 登录即可查：语音助手前端据此展示「AI 增强」徽标 */
  @Get('status')
  @Operation('查询 AI 接入状态')
  async status() {
    const cfg = await this.ai.getConfig()
    return {
      ready: await this.ai.isReady(),
      provider: cfg.provider,
      model: cfg.model,
    }
  }

  @Get('config')
  @RequirePermissions('system:ai-config')
  @Operation('查询 AI 模型设置（Key 脱敏）')
  config() {
    return this.ai.getConfigView()
  }

  @Put('config')
  @RequirePermissions('system:ai-config')
  @Operation('保存 AI 模型设置')
  save(
    @Body()
    dto: {
      provider?: string
      baseURL?: string
      apiKey?: string
      model?: string
      enabled?: boolean
      temperature?: number
      timeoutMs?: number
    },
  ) {
    return this.ai.saveConfig(dto)
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('system:ai-config')
  @Operation('测试 AI 模型连接')
  test() {
    return this.ai.test()
  }
}
