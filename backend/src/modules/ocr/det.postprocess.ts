import type { DetBox } from './ocr.types'

export interface DetPostOptions {
  /** 概率图二值化阈值 */
  thresh: number
  /** 文本框平均得分下限 */
  boxThresh: number
  /** 文本框外扩比例，用于补回 DB 收缩训练带来的内缩 */
  unclipRatio: number
  /** 最小像素面积，过滤噪点 */
  minArea: number
}

export const DET_POST_DEFAULTS: DetPostOptions = {
  thresh: 0.3,
  boxThresh: 0.6,
  unclipRatio: 1.5,
  minArea: 4,
}

/**
 * 概率图 → 文本框。
 *
 * 用连通域加轴对齐外接框替代 DB 原版的轮廓提取与最小外接矩形：
 * 票据、证件类文本行方向固定，轴对齐框足够，且省去多边形拟合的复杂度。
 * 代价是倾斜文本会被框大，留待后续按需替换。
 */
export function boxesFromProbMap(
  prob: Float32Array,
  width: number,
  height: number,
  options: Partial<DetPostOptions> = {},
): DetBox[] {
  const opts = { ...DET_POST_DEFAULTS, ...options }
  const total = width * height
  const visited = new Uint8Array(total)
  const stack = new Int32Array(total)
  const boxes: DetBox[] = []

  for (let seed = 0; seed < total; seed++) {
    if (visited[seed] || prob[seed] <= opts.thresh) continue

    let top = seed
    let sp = 0
    stack[sp++] = seed
    visited[seed] = 1

    let minX = width
    let maxX = -1
    let minY = height
    let maxY = -1
    let sum = 0
    let count = 0

    while (sp > 0) {
      const idx = stack[--sp]
      const x = idx % width
      const y = (idx - x) / width

      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      sum += prob[idx]
      count++

      const yStart = y > 0 ? y - 1 : 0
      const yEnd = y < height - 1 ? y + 1 : height - 1
      const xStart = x > 0 ? x - 1 : 0
      const xEnd = x < width - 1 ? x + 1 : width - 1
      for (let ny = yStart; ny <= yEnd; ny++) {
        const rowBase = ny * width
        for (let nx = xStart; nx <= xEnd; nx++) {
          const nIdx = rowBase + nx
          if (visited[nIdx] || prob[nIdx] <= opts.thresh) continue
          visited[nIdx] = 1
          stack[sp++] = nIdx
        }
      }
    }

    const boxWidth = maxX - minX + 1
    const boxHeight = maxY - minY + 1
    if (boxWidth * boxHeight < opts.minArea) continue
    if (count < opts.minArea) continue

    const score = sum / count
    if (score < opts.boxThresh) continue

    const unclip = (boxWidth * boxHeight * opts.unclipRatio) / (2 * (boxWidth + boxHeight))
    boxes.push({
      x1: minX - unclip,
      y1: minY - unclip,
      x2: maxX + 1 + unclip,
      y2: maxY + 1 + unclip,
      score,
    })
  }

  return sortReadingOrder(boxes)
}

/** 先按纵向重叠分行，再在行内按横坐标排序，得到接近人眼的阅读顺序 */
export function sortReadingOrder(boxes: DetBox[]): DetBox[] {
  const sorted = [...boxes].sort((a, b) => a.y1 - b.y1)
  const bands: Array<{ top: number; bottom: number; items: DetBox[] }> = []

  for (const box of sorted) {
    const height = box.y2 - box.y1
    const band = bands.find((b) => {
      const overlap = Math.min(b.bottom, box.y2) - Math.max(b.top, box.y1)
      const refHeight = Math.min(b.bottom - b.top, height)
      return overlap > refHeight * 0.5
    })
    if (band) {
      band.items.push(box)
      band.top = Math.min(band.top, box.y1)
      band.bottom = Math.max(band.bottom, box.y2)
    } else {
      bands.push({ top: box.y1, bottom: box.y2, items: [box] })
    }
  }

  bands.sort((a, b) => a.top - b.top)
  return bands.flatMap((b) => b.items.sort((p, q) => p.x1 - q.x1))
}

/** 把检测阶段（缩放后）的坐标还原到原图坐标系 */
export function scaleBoxes(boxes: DetBox[], scaleX: number, scaleY: number): DetBox[] {
  return boxes.map((b) => ({
    x1: b.x1 * scaleX,
    y1: b.y1 * scaleY,
    x2: b.x2 * scaleX,
    y2: b.y2 * scaleY,
    score: b.score,
  }))
}

export function clampBox(box: DetBox, width: number, height: number): DetBox {
  return {
    x1: Math.max(0, Math.min(box.x1, width - 1)),
    y1: Math.max(0, Math.min(box.y1, height - 1)),
    x2: Math.max(1, Math.min(box.x2, width)),
    y2: Math.max(1, Math.min(box.y2, height)),
    score: box.score,
  }
}