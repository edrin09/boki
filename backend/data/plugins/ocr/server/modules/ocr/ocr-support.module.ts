import { Module } from '@nestjs/common'
import { OcrEngine } from './engine/ocr.engine'
import { DocumentParseService } from './document-parse.service'

/**
 * OCR 公共支撑模块。
 *
 * 只提供引擎与文档解析能力，不注册任何控制器，供插件间共享：
 * - `ocr` 插件自身：证件/票据识别接口
 * - `hr` 插件：工资导入
 * - `receipts` 插件：票据解析
 *
 * Nest 模块为单例，多处 import 不会重复加载 ONNX 模型。
 */
@Module({
  providers: [OcrEngine, DocumentParseService],
  exports: [OcrEngine, DocumentParseService],
})
export class OcrSupportModule {}
