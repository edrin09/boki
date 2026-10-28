import { Injectable, Logger } from '@nestjs/common'
import * as sherpa from 'sherpa-onnx-node'
import {
  asrModelPath,
  asrReady,
  missingAsrModels,
  resolveAsrModelDir,
} from './asr-model.path'
import { parseWav } from './wav.utils'

/**
 * 流式语音识别（sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30）。
 *
 * - 在线识别器：WebSocket 会话逐帧喂 16k PCM，逐字吐部分结果（partial）
 * - REST 整段转写：同一个识别器单流灌整段音频取终稿（query/transcribe 复用）
 * - 懒加载 + 失败可重试（模型补齐后无需重启进程）
 */
@Injectable()
export class VoiceAsrService {
  private readonly logger = new Logger('VoiceAsr')
  private recognizer?: sherpa.OnlineRecognizer
  private loaded = false
  private lastError?: string

  isReady(): boolean {
    return Boolean(this.recognizer)
  }

  status(): { ready: boolean; modelDir: string; missing: string[]; error?: string } {
    return {
      ready: this.isReady(),
      modelDir: resolveAsrModelDir(),
      missing: missingAsrModels(),
      error: this.lastError,
    }
  }

  async ensureLoaded(): Promise<sherpa.OnlineRecognizer> {
    if (this.recognizer) return this.recognizer
    if (!asrReady()) {
      return Promise.reject(
        new Error(
          `ASR 模型未就绪，缺失: ${missingAsrModels().join(', ')}，目录: ${resolveAsrModelDir()}`,
        ),
      )
    }
    if (this.loaded) {
      // 上次构造失败后模型文件已补齐，重试构造
      this.loaded = false
    }
    if (!this.loading) {
      this.loopLog(`开始加载流式 ASR 模型: ${resolveAsrModelDir()}`)
      this.loading = this.doLoad()
    }
    return this.loading
  }

  private loading?: Promise<sherpa.OnlineRecognizer>

  private async doLoad(): Promise<sherpa.OnlineRecognizer> {
    try {
      const recognizer = new sherpa.OnlineRecognizer({
        modelConfig: {
          transducer: {
            encoder: asrModelPath('encoder'),
            decoder: asrModelPath('decoder'),
            joiner: asrModelPath('joiner'),
          },
          tokens: asrModelPath('tokens'),
          numThreads: 2,
          provider: 'cpu',
          debug: 0,
        },
        decodingMethod: 'greedy_search',
        enableEndpointDetection: true,
        rule1MinTrailingSilence: 2.25,
        rule2MinTrailingSilence: 1.2,
        rule3MinUtteranceLength: 15,
      })
      this.recognizer = recognizer
      this.loaded = true
      this.lastError = undefined
      this.logger.log('流式 ASR 模型加载完成')
      return recognizer
    } catch (err) {
      this.loading = undefined
      this.lastError = (err as Error).message
      throw err
    }
  }

  private loopLog(message: string): void {
    this.logger.log(message)
  }

  /**
   * 开启一个流式识别会话（WebSocket 用）。
   * accept 喂 16k Float32 段；partial() 返回当前已识别文本；finish() 取终稿。
   */
  async openStream(): Promise<AsrStream> {
    const recognizer = await this.ensureLoaded()
    const native = recognizer.createStream()

    const drain = (): string => {
      while (recognizer.isReady(native)) recognizer.decode(native)
      return recognizer.getResult(native)?.text ?? ''
    }

    return {
      accept: (samples: Float32Array) => {
        native.acceptWaveform({ samples, sampleRate: 16000 })
        drain()
      },
      partial: () => drain(),
      finish: (): string => {
        native.inputFinished()
        while (recognizer.isReady(native)) recognizer.decode(native)
        return recognizer.getResult(native)?.text ?? ''
      },
      destroy: () => {
        void native
      },
    }
  }

  /** 整段 WAV（PCM16/Float32，任意采样率）→ 终稿文本。REST 接口用。 */
  async recognize(wavBuffer: Buffer): Promise<AsrResult> {
    const recognizer = await this.ensureLoaded()
    const startedAt = Date.now()

    const { samples } = parseWav(wavBuffer)
    const stream = recognizer.createStream()
    stream.acceptWaveform({ samples, sampleRate: 16000 })
    while (recognizer.isReady(stream)) recognizer.decode(stream)
    const result = recognizer.getResult(stream)
    const text = (result?.text ?? '').trim()

    return {
      text,
      latencyMs: Date.now() - startedAt,
      modelLoaded: true,
    }
  }
}

export interface AsrResult {
  text: string
  /** 首请求含模型加载（1-3s），后续为纯推理耗时 */
  latencyMs: number
  modelLoaded: boolean
}

export interface AsrStream {
  accept: (samples: Float32Array) => void
  partial: () => string
  finish: () => string
  destroy: () => void
}