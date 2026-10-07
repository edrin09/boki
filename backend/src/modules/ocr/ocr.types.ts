export interface RawImage {
  /** RGB 三通道原始像素 */
  data: Buffer
  width: number
  height: number
}

export interface OcrBox {
  text: string
  score: number
  /** 四角点，顺序为左上、右上、右下、左下 */
  points: Array<[number, number]>
}

export interface OcrResult {
  lines: OcrBox[]
  width: number
  height: number
  elapsedMs: number
}

export interface DetBox {
  x1: number
  y1: number
  x2: number
  y2: number
  score: number
}

export interface RecognizeOptions {
  /** 检测阶段长边上限，超出则等比缩小 */
  detMaxSide?: number
  /** 检测二值化阈值 */
  detThresh?: number
  /** 文本框得分下限 */
  boxThresh?: number
  /** 文本框外扩比例 */
  unclipRatio?: number
  /** 是否对每个文本框做 180 度方向判定 */
  useAngleCls?: boolean
}