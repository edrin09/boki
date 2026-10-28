import * as fs from 'node:fs'
import { modelPath } from './ocr-model.path'
import { REC_HEIGHT } from './image.util'

let cachedChars: string[] | null = null

/**
 * 识别模型的字符表：索引 0 为 CTC blank，末位为空格，中间为字典。
 * 与 rec 模型输出维度 6625 = 1 + 6623 + 1 对应。
 */
export function loadChars(): string[] {
  if (cachedChars) return cachedChars
  const raw = fs.readFileSync(modelPath('keys'), 'utf8')
  const dict = raw.split(/\r?\n/).filter((line, idx, arr) => !(idx === arr.length - 1 && line === ''))
  cachedChars = ['', ...dict, ' ']
  return cachedChars
}

export function recInputWidth(cropWidth: number, cropHeight: number, maxWidth = 1600): number {
  const ratio = cropWidth / Math.max(1, cropHeight)
  const width = Math.ceil(REC_HEIGHT * ratio)
  return Math.min(Math.max(width, 8), maxWidth)
}

export interface CtcDecodeResult {
  text: string
  score: number
}

/**
 * CTC 贪心解码：逐时间步取最大概率类别，合并重复、剔除 blank。
 * 得分取被保留字符的平均概率，用于后续判定是否需要人工复核。
 */
export function decodeCtc(
  output: Float32Array,
  timeSteps: number,
  numClasses: number,
  chars: string[] = loadChars(),
): CtcDecodeResult {
  let text = ''
  let scoreSum = 0
  let kept = 0
  let prevIndex = -1

  for (let t = 0; t < timeSteps; t++) {
    const base = t * numClasses
    let bestIndex = 0
    let bestProb = output[base]
    for (let c = 1; c < numClasses; c++) {
      const p = output[base + c]
      if (p > bestProb) {
        bestProb = p
        bestIndex = c
      }
    }
    if (bestIndex !== 0 && bestIndex !== prevIndex) {
      const ch = chars[bestIndex]
      if (ch !== undefined) {
        text += ch
        scoreSum += bestProb
        kept++
      }
    }
    prevIndex = bestIndex
  }

  return { text, score: kept > 0 ? scoreSum / kept : 0 }
}

export interface AngleDecision {
  /** 是否应旋转 180 度 */
  flip: boolean
  score: number
}

/** 方向分类输出为 [1,2]，标签 1 表示倒置；低置信度不翻转以免误伤 */
export function decideFlip(output: Float32Array, threshold = 0.9): AngleDecision {
  const upright = output[0]
  const upsideDown = output[1]
  const label = upsideDown > upright ? 1 : 0
  const score = Math.max(upright, upsideDown)
  return { flip: label === 1 && score >= threshold, score }
}