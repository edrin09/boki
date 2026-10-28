import { createCanvas } from '@napi-rs/canvas'
import type { OcrBox } from './ocr.types'

export interface PdfPageText {
  width: number
  height: number
  /** 文本层抽取的行（与 OCR 输出同构，score 恒为 1） */
  lines: OcrBox[]
  rawText: string
  /**
   * 本页无文本层时的渲染图（PNG buffer），需走 OCR。
   * 有文本层的页面为 undefined——调用方按页决定走文本层还是 OCR，
   * 而不是整份 PDF 二选一。
   */
  image?: Buffer
}

export interface PdfParseOutput {
  /** 至少一页抽到了文本层 */
  hasTextLayer: boolean
  /** 需要 OCR 的渲染页数量 */
  renderPageCount: number
  pageCount: number
  /** 逐页结果（文本层与渲染图按页共存） */
  pages: PdfPageText[]
  /** 无文本层时渲染出的页面图（PNG buffer），仅含待 OCR 页 */
  images: Buffer[]
  /** 全部页文本拼接（供结构化解析） */
  fullText: string
}

/** 渲染模式页数上限（防超大 PDF 打满内存） */
export const MAX_RENDER_PAGES = 10
/** 文本层模式页数上限 */
export const MAX_TEXT_PAGES = 20

interface RawItem {
  str: string
  x: number
  y: number
  width: number
  height: number
}

const Y_TOLERANCE = 3

let pdfLibPromise: Promise<any> | null = null

/** 懒加载 pdfjs（legacy ESM build，Node 下自动使用 fake worker） */
function loadPdfLib(): Promise<any> {
  if (!pdfLibPromise) {
    pdfLibPromise = import('pdfjs-dist/legacy/build/pdf.mjs')
  }
  return pdfLibPromise
}

function mergeLine(items: RawItem[]): OcrBox {
  const sorted = [...items].sort((a, b) => a.x - b.x)
  let text = ''
  let prev: RawItem | null = null
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (const it of sorted) {
    // 单词片段间有明显间隙时补空格，避免粘连
    if (prev && it.x - (prev.x + prev.width) > Math.max(prev.width * 0.3, 1)) {
      text += ' '
    }
    text += it.str
    x1 = Math.min(x1, it.x)
    y1 = Math.min(y1, it.y)
    x2 = Math.max(x2, it.x + it.width)
    y2 = Math.max(y2, it.y + (it.height || 12))
    prev = it
  }
  return { text, score: 1, points: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]] }
}

function itemsToLines(items: RawItem[]): OcrBox[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: OcrBox[] = []
  let cur: RawItem[] = []
  let curY = -1
  for (const it of sorted) {
    if (cur.length && Math.abs(it.y - curY) > Y_TOLERANCE) {
      lines.push(mergeLine(cur))
      cur = []
    }
    curY = it.y
    cur.push(it)
  }
  if (cur.length) lines.push(mergeLine(cur))
  return lines
}

/**
 * 解析 PDF：逐页决策——有文本层的页抽文本，无文本层的页渲染成 PNG 供 OCR。
 *
 * 混合型 PDF（部分页有文本层、部分页是扫描图）按页合并，
 * 不会再因为存在任一扫描页就丢弃已抽到的文本页。
 */
export async function parsePdf(
  buffer: Buffer,
  options: { renderScale?: number } = {},
): Promise<PdfParseOutput> {
  const pdfjs = await loadPdfLib()
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) })
  const doc = await loadingTask.promise
  const pageCount = Math.min(doc.numPages, MAX_TEXT_PAGES)

  const pages: PdfPageText[] = []
  const images: Buffer[] = []
  let hasTextLayer = false

  try {
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i)
      const viewport = page.getViewport({ scale: 1 })

      const content = await page.getTextContent()
      const rawItems: RawItem[] = []
      for (const item of content.items) {
        const s = (item as any).str
        if (!s || !s.trim()) continue
        const t = item as any
        const transform = t.transform as number[]
        const [vx, vy] = viewport.convertToViewportPoint(transform[4], transform[5])
        rawItems.push({
          str: s,
          x: vx,
          y: vy,
          width: t.width ?? 0,
          height: t.height ?? 12,
        })
      }

      const lines = itemsToLines(rawItems)
      if (lines.length > 0) {
        hasTextLayer = true
        pages.push({
          width: viewport.width,
          height: viewport.height,
          lines,
          rawText: lines.map((l) => l.text).join('\n'),
        })
      } else {
        // 本页无文本层：渲染为图（超过渲染上限则截断该页，不影响已抽到的文本页）
        const png =
          images.length < MAX_RENDER_PAGES
            ? await renderPageToPng(page, viewport, options.renderScale ?? 2)
            : undefined
        if (png) images.push(png)
        pages.push({
          width: viewport.width,
          height: viewport.height,
          lines: [],
          rawText: '',
          image: png,
        })
      }
      page.cleanup()
    }
  } finally {
    await loadingTask.destroy()
  }

  const fullText = pages.map((p) => p.rawText).filter(Boolean).join('\n\n')
  return {
    hasTextLayer,
    renderPageCount: images.length,
    pageCount,
    pages,
    images,
    fullText,
  }
}

/** 将 PDF 页渲染为 PNG（@napi-rs/canvas，无本机编译依赖） */
async function renderPageToPng(
  page: any,
  viewport: any,
  scale: number,
): Promise<Buffer> {
  const width = Math.max(1, Math.ceil(viewport.width * scale))
  const height = Math.max(1, Math.ceil(viewport.height * scale))
  const renderViewport = page.getViewport({ scale })

  const canvasFactory = {
    create(w: number, h: number) {
      const canvas = createCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)))
      return { canvas, context: canvas.getContext('2d') }
    },
    reset(c: any, w: number, h: number) {
      c.canvas.width = Math.max(1, Math.ceil(w))
      c.canvas.height = Math.max(1, Math.ceil(h))
    },
    destroy(c: any) {
      c.canvas.width = 0
      c.canvas.height = 0
      c.canvas = null
      c.context = null
    },
  }

  const { canvas, context } = canvasFactory.create(width, height)
  await page.render({
    canvasContext: context,
    viewport: renderViewport,
    canvasFactory,
  }).promise
  return canvas.toBuffer('image/png')
}
