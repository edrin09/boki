import { BadRequestException, Injectable } from '@nestjs/common'
import { OcrEngine } from './engine/ocr.engine'
import { missingModels, resolveModelDir } from './engine/ocr-model.path'
import { DocumentParseService, type ParsedContent } from './document-parse.service'
import {
  AUTO_SELECT_CONFIDENCE,
  EXPECTED_DOC_TYPE,
  FIELD_MAP,
  TARGET_LABELS,
  type ExtractTarget,
} from './field-map'

export interface ExtractedField {
  /** 解析器原始字段键 */
  key: string
  /** 解析器原始标签 */
  label: string
  /** 归一化后的值（性别等已转成表单取值） */
  value: string | number | null
  confidence: number
  /** 映射到的档案字段，未映射为 null */
  targetKey: string | null
  targetLabel: string | null
  /** 默认是否勾选（已映射 + 值非空 + 置信度达标） */
  selected: boolean
}

export interface ExtractResult {
  fileName: string
  target: ExtractTarget
  targetLabel: string
  docType: string
  docTypeName: string
  /** 证件类型是否与目标档案匹配 */
  docTypeMatched: boolean
  confidence: number
  /** 文本来源：文本层 PDF 直抽 / OCR 识别 */
  source: 'ocr' | 'pdf'
  fields: ExtractedField[]
  /** 默认勾选字段的表单取值，供「一键填充」直接使用 */
  values: Record<string, string | number>
  message?: string
}

@Injectable()
export class ExtractService {
  constructor(
    private readonly parser: DocumentParseService,
    private readonly engine: OcrEngine,
  ) {}

  isReady(): boolean {
    return this.engine.isReady()
  }

  notReadyMessage(): string {
    return `OCR 模型未就绪，缺失文件: ${missingModels().join(', ') || '无'}，模型目录: ${resolveModelDir()}`
  }

  async extract(
    buffer: Buffer,
    mimeType: string,
    fileName: string,
    target: ExtractTarget,
  ): Promise<ExtractResult> {
    let parsed: ParsedContent
    try {
      parsed = await this.parser.parse(buffer, mimeType)
    } catch (err) {
      throw new BadRequestException(
        `文件内容无法解析，请确认上传的是清晰的证件图片或 PDF（${(err as Error).message}）`,
      )
    }
    const { result, source } = parsed
    const map = FIELD_MAP[target]

    const fields: ExtractedField[] = result.fields.map((f) => {
      const mapped = map[f.key]
      const rawValue = f.value
      const value = mapped?.transform ? mapped.transform(rawValue as string | number) : rawValue
      const hasValue = value !== null && value !== undefined && String(value).trim() !== ''
      return {
        key: f.key,
        label: f.label,
        value,
        confidence: f.confidence,
        targetKey: mapped?.key ?? null,
        targetLabel: mapped?.label ?? null,
        selected: Boolean(mapped) && hasValue && f.confidence >= AUTO_SELECT_CONFIDENCE,
      }
    })

    const values: Record<string, string | number> = {}
    for (const f of fields) {
      if (f.targetKey && f.selected && f.value !== null) values[f.targetKey] = f.value
    }

    const docTypeMatched = result.type === EXPECTED_DOC_TYPE[target]
    return {
      fileName,
      target,
      targetLabel: TARGET_LABELS[target],
      docType: result.type,
      docTypeName: result.typeName,
      docTypeMatched,
      confidence: result.confidence,
      source,
      fields,
      values,
      message: docTypeMatched
        ? undefined
        : `识别为「${result.typeName}」，与${TARGET_LABELS[target]}档案不匹配，请确认后手动填写`,
    }
  }
}