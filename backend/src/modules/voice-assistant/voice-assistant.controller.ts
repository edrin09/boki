import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { Response } from 'express'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { Operation } from '../../common/decorators/operation.decorator'
import { AiService } from '../ai/ai.service'
import { VoiceAsrService } from './voice-asr.service'
import { VoiceQueryService, type VoiceQueryResult } from './voice-query.service'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const AUDIO_MIME = /^(audio|multipart|application\/octet-stream)/i

const audioUpload = FileInterceptor('audio', {
  storage: memoryStorage(),
  defParamCharset: 'utf8',
  limits: { fileSize: MAX_UPLOAD_BYTES },
})

@Controller('voice')
@RequirePermissions('voice:use')
export class VoiceAssistantController {
  constructor(
    private readonly asr: VoiceAsrService,
    private readonly voiceQuery: VoiceQueryService,
    private readonly ai: AiService,
  ) {}

  @Get('status')
  @Operation('查询语音助手状态（ASR / AI 增强就绪情况/ AI 增强就绪情况）')
  async status() {
    return {
      ...this.asr.status(),
      /** AI 增强：已接入大模型时自由说法走语义理解，未接入走关键词匹配 */
      ai: await this.ai.getConfig().then((c) => ({
        ready: Boolean(c.enabled && c.baseURL && c.model),
        provider: c.provider,
        model: c.model,
      })),
      /** 前端 FAB 可见性：模型未就绪仍可用文字输入（Plan B） */
      textFallbackAvailable: true,
    }
  }

  @Post('query')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(audioUpload)
  @Operation('语音提问：识别 → 意图 → 查询 → Excel → 话术')
  async query(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('text') text: string | undefined,
  ): Promise<VoiceQueryResult> {
    let transcript = (text ?? '').trim()

    if (file) {
      if (!AUDIO_MIME.test(file.mimetype ?? '')) {
        throw new BadRequestException(`暂不支持的音频类型: ${file.mimetype}`)
      }
      const asrResult = await this.asr.recognize(file.buffer)
      transcript = asrResult.text
      if (!transcript) {
        throw new BadRequestException('没有听清内容，请靠近一点再试，也可以直接打字')
      }
    }

    if (!transcript) {
      throw new BadRequestException('请说话或在输入框输入指令')
    }

    return this.voiceQuery.runText(transcript)
  }

  @Post('transcribe')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(audioUpload)
  @Operation('语音转写：只识别文字，不执行查询（松开空格后填入输入框）')
  async transcribe(@UploadedFile() file: Express.Multer.File | undefined): Promise<{ text: string }> {
    if (!file) throw new BadRequestException('请提供录音文件')
    if (!AUDIO_MIME.test(file.mimetype ?? '')) {
      throw new BadRequestException(`暂不支持的音频类型: ${file.mimetype}`)
    }
    const asrResult = await this.asr.recognize(file.buffer)
    return { text: asrResult.text }
  }

  @Get('export/:exportId')
  @Operation('下载语音查询生成的 Excel')
  download(@Param('exportId') exportId: string, @Res() res: Response) {
    const found = this.voiceQuery.downloadExport(exportId)
    if (!found) {
      throw new BadRequestException('导出已过期或不存在，请重新提问')
    }
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    // 文件名 decode 后放入 UTF-8 编码的 attachment，避免中文乱码
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(found.filename)}`,
    )
    res.send(found.buffer)
  }
}
