import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { VoiceAsrService } from './voice-asr.service'
import { createVoiceStreamServer } from './voice-stream.server'

/**
 * 流式语音识别 WebSocket 挂载。
 *
 * 由插件模块在应用启动完成后自行挂载到同一 HTTP 端口，
 * 内核不再直接依赖语音插件。
 */
@Injectable()
export class VoiceStreamService implements OnApplicationBootstrap {
  private readonly logger = new Logger('VoiceWs')

  constructor(
    private readonly asr: VoiceAsrService,
    private readonly jwt: JwtService,
    private readonly adapterHost: HttpAdapterHost,
  ) {}

  onApplicationBootstrap(): void {
    const httpServer = this.adapterHost.httpAdapter?.getHttpServer()
    if (!httpServer) return
    try {
      createVoiceStreamServer(
        httpServer,
        this.asr,
        this.jwt,
        process.env.APP_PREFIX || 'api',
        (err) => this.logger.warn(`语音流会话异常: ${err.message}`),
      )
      this.logger.log(`流式识别 WebSocket 就绪：/${process.env.APP_PREFIX || 'api'}/voice/stream`)
    } catch (err) {
      this.logger.warn(`语音流服务未启动：${(err as Error).message}`)
    }
  }
}
