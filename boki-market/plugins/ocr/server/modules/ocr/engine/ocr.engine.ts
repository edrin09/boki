import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import * as ort from 'onnxruntime-node'
import type { OcrBox, OcrResult, RawImage, RecognizeOptions } from './ocr.types'
import {
  CLS_SHAPE,
  DET_NORM,
  REC_HEIGHT,
  REC_NORM,
  calcDetSize,
  cropRgb,
  decodeToRgb,
  resizeRgb,
  rotate180,
  toChwTensor,
} from './image.util'
import { boxesFromProbMap, clampBox, scaleBoxes } from './det.postprocess'
import { decideFlip, decodeCtc, recInputWidth } from './rec.postprocess'
import { missingModels, modelPath, modelsReady, resolveModelDir } from './ocr-model.path'

const DEFAULTS: Required<RecognizeOptions> = {
  detMaxSide: 960,
  detThresh: 0.3,
  boxThresh: 0.6,
  unclipRatio: 1.5,
  useAngleCls: true,
}

/**
 * 逐项回退默认值。
 *
 * 不能直接用对象展开：经过 ValidationPipe 转换的 DTO 实例会把声明过的字段
 * 以 undefined 形式带上，展开后会把默认值抹成 undefined。
 */
function withDefaults(options?: RecognizeOptions): Required<RecognizeOptions> {
  const o = options ?? {}
  return {
    detMaxSide: o.detMaxSide ?? DEFAULTS.detMaxSide,
    detThresh: o.detThresh ?? DEFAULTS.detThresh,
    boxThresh: o.boxThresh ?? DEFAULTS.boxThresh,
    unclipRatio: o.unclipRatio ?? DEFAULTS.unclipRatio,
    useAngleCls: o.useAngleCls ?? DEFAULTS.useAngleCls,
  }
}

/** 限制同时在跑的推理数量，避免批量上传时把 CPU 打满 */
class Semaphore {
  private active = 0
  private queue: Array<() => void> = []

  constructor(private readonly limit: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++
      return
    }
    await new Promise<void>((resolve) => this.queue.push(resolve))
    this.active++
  }

  release(): void {
    this.active--
    const next = this.queue.shift()
    if (next) next()
  }
}

@Injectable()
export class OcrEngine implements OnModuleInit {
  private readonly logger = new Logger('OcrEngine')
  private readonly semaphore = new Semaphore(2)

  private detSession?: ort.InferenceSession
  private clsSession?: ort.InferenceSession
  private recSession?: ort.InferenceSession
  private loading?: Promise<void>

  async onModuleInit(): Promise<void> {
    if (!modelsReady()) {
      this.logger.warn(
        `OCR 模型不完整，识别功能不可用。缺失: ${missingModels().join(', ')}，模型目录: ${resolveModelDir()}`,
      )
      return
    }
    try {
      await this.ensureLoaded()
      await this.warmup()
      this.logger.log(`OCR 模型加载完成: ${resolveModelDir()}`)
    } catch (err) {
      this.logger.error(`OCR 模型加载失败: ${(err as Error).message}`)
    }
  }

  isReady(): boolean {
    return Boolean(this.detSession && this.recSession)
  }

  private async ensureLoaded(): Promise<void> {
    if (this.detSession && this.recSession) return
    if (!this.loading) {
      this.loading = (async () => {
        const [det, cls, rec] = await Promise.all([
          ort.InferenceSession.create(modelPath('det')),
          ort.InferenceSession.create(modelPath('cls')),
          ort.InferenceSession.create(modelPath('rec')),
        ])
        this.detSession = det
        this.clsSession = cls
        this.recSession = rec
      })().catch((err) => {
        this.loading = undefined
        throw err
      })
    }
    await this.loading
  }

  /** 用空白图跑一遍，把算子初始化成本提前到启动阶段 */
  private async warmup(): Promise<void> {
    const blank: RawImage = { data: Buffer.alloc(64 * 64 * 3, 255), width: 64, height: 64 }
    await this.runDet(blank)
    await this.runRec(blank)
  }

  async recognize(input: Buffer, options: RecognizeOptions = {}): Promise<OcrResult> {
    const opts = withDefaults(options)
    await this.ensureLoaded()
    await this.semaphore.acquire()
    const startedAt = Date.now()
    try {
      return await this.recognizeInner(input, opts, startedAt)
    } finally {
      this.semaphore.release()
    }
  }

  private async recognizeInner(
    input: Buffer,
    opts: Required<RecognizeOptions>,
    startedAt: number,
  ): Promise<OcrResult> {
    const original = await decodeToRgb(input)

    const detSize = calcDetSize(original.width, original.height, opts.detMaxSide)
    const detImage = await resizeRgb(original, detSize.width, detSize.height)
    const probMap = await this.runDet(detImage)

    const scaled = scaleBoxes(
      boxesFromProbMap(probMap, detSize.width, detSize.height, {
        thresh: opts.detThresh,
        boxThresh: opts.boxThresh,
        unclipRatio: opts.unclipRatio,
      }),
      original.width / detSize.width,
      original.height / detSize.height,
    )

    const lines: OcrBox[] = []
    for (const raw of scaled) {
      const box = clampBox(raw, original.width, original.height)
      if (box.x2 - box.x1 < 2 || box.y2 - box.y1 < 2) continue

      let crop = cropRgb(original, box.x1, box.y1, box.x2, box.y2)
      if (opts.useAngleCls && this.clsSession) {
        const decision = await this.runCls(crop)
        if (decision.flip) crop = rotate180(crop)
      }
      const { text, score } = await this.runRec(crop)
      if (!text.trim()) continue

      lines.push({
        text,
        score,
        points: [
          [box.x1, box.y1],
          [box.x2, box.y1],
          [box.x2, box.y2],
          [box.x1, box.y2],
        ],
      })
    }

    return {
      lines,
      width: original.width,
      height: original.height,
      elapsedMs: Date.now() - startedAt,
    }
  }

  private async runDet(image: RawImage): Promise<Float32Array> {
    const session = this.detSession
    const tensor = new ort.Tensor('float32', toChwTensor(image, DET_NORM.mean, DET_NORM.std), [
      1,
      3,
      image.height,
      image.width,
    ])
    const outputs = await session.run({ x: tensor })
    const out = outputs[session.outputNames[0]]
    return out.data as Float32Array
  }

  private async runCls(crop: RawImage): Promise<{ flip: boolean; score: number }> {
    const session = this.clsSession
    const image = await resizeRgb(crop, CLS_SHAPE.width, CLS_SHAPE.height)
    const tensor = new ort.Tensor('float32', toChwTensor(image, REC_NORM.mean, REC_NORM.std), [
      1,
      3,
      image.height,
      image.width,
    ])
    const outputs = await session.run({ x: tensor })
    const out = outputs[session.outputNames[0]]
    return decideFlip(out.data as Float32Array)
  }

  private async runRec(crop: RawImage): Promise<{ text: string; score: number }> {
    const session = this.recSession
    const width = recInputWidth(crop.width, crop.height)
    const image = await resizeRgb(crop, width, REC_HEIGHT)
    const tensor = new ort.Tensor('float32', toChwTensor(image, REC_NORM.mean, REC_NORM.std), [
      1,
      3,
      image.height,
      image.width,
    ])
    const outputs = await session.run({ x: tensor })
    const out = outputs[session.outputNames[0]]
    const dims = out.dims as number[]
    const timeSteps = dims[1]
    const numClasses = dims[2]
    return decodeCtc(out.data as Float32Array, timeSteps, numClasses)
  }
}