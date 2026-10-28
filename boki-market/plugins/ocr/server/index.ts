import { OcrPluginModule } from './modules/ocr/ocr.module'

export const module = OcrPluginModule

// OCR 不拥有业务实体；模型文件仍放在内核 models/ocr 目录。
export const entities = []
