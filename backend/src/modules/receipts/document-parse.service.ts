import { BadRequestException, Injectable } from '@nestjs/common'
import { OcrEngine } from '../ocr/ocr.engine'
import { missingModels, resolveModelDir } from '../ocr/ocr-model.path'
import { parsePdf } from '../ocr/pdf.util'
import { parseDocument } from './parsers/parser.registry'
import type { ParseResult } from './parsers/parser.types'

const MAX_DET_SIDE = 1600

export interface ParsedContent {
  result: ParseResult
  rawText: string
  pageCount: number
  source: 'ocr' | 'pdf'
}

/**
 * 文件内容 → 结构化字段的公共链路。
 *
 * 票据上传（P15）与证件一键录入（P16）共用同一套解析能力：
 * 图片直接 OCR；PDF 优先文本层，扫描件渲染为图后 OCR。
 */
@Injectable()
export class DocumentParseService {
  constructor(private readonly engine: OcrEngine) {}

  /** OCR 不可用时给出可读提示，避免底层 onnx 加载异常直接暴露 */
  private requireOcr(): void {
    if (!this.engine.isReady()) {
      throw new BadRequestException(
        `OCR 模型未就绪，缺失文件: ${missingModels().join(', ') || '无'}，模型目录: ${resolveModelDir()}`,
      )
    }
  }

  async parse(buffer: Buffer, mimeType: string): Promise<ParsedContent> {
    if (mimeType !== 'application/pdf') {
      this.requireOcr()
      const ocr = await this.engine.recognize(buffer, { detMaxSide: MAX_DET_SIDE })
      const rawText = ocr.lines.map((l) => l.text).join('\n')
      const result = parseDocument({
        lines: ocr.lines,
        rawText,
        width: ocr.width,
        height: ocr.height,
        source: 'ocr',
      })
      return { result, rawText, pageCount: 1, source: 'ocr' }
    }

    const pdf = await parsePdf(buffer)

    if (pdf.hasTextLayer && pdf.fullText.trim()) {
      const lines = pdf.pages.flatMap((p) => p.lines)
      const first = pdf.pages[0]
      const result = parseDocument({
        lines,
        rawText: pdf.fullText,
        width: first?.width ?? 0,
        height: first?.height ?? 0,
        source: 'pdf',
      })
      return { result, rawText: pdf.fullText, pageCount: pdf.pageCount, source: 'pdf' }
    }

    const allLines: Array<{ text: string; score: number; points: Array<[number, number]> }> = []
    const rawParts: string[] = []
    this.requireOcr()
    for (const img of pdf.images) {
      const ocr = await this.engine.recognize(img, { detMaxSide: MAX_DET_SIDE })
      allLines.push(...ocr.lines)
      rawParts.push(ocr.lines.map((l) => l.text).join('\n'))
    }
    const rawText = rawParts.join('\n\n')
    const result = parseDocument({ lines: allLines, rawText, width: 0, height: 0, source: 'ocr' })
    return { result, rawText, pageCount: pdf.pageCount, source: 'ocr' }
  }
}