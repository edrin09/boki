/**
 * OCR 插件对其他插件暴露的公共接口。
 *
 * 依赖本插件的插件应从这里导入，避免直接依赖内部文件布局。
 */
export { OcrPluginModule as OcrModule, OcrPluginModule } from './ocr.module'
export { OcrSupportModule } from './ocr-support.module'
export { DocumentParseService } from './document-parse.service'
export { OcrEngine } from './engine/ocr.engine'
export { missingModels, resolveModelDir } from './engine/ocr-model.path'
export { parsePdf } from './engine/pdf.util'
export type { ExtractTarget } from './field-map'
