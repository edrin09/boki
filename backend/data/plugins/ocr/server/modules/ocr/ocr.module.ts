import { Module } from '@nestjs/common'
import { OcrController } from './ocr.controller'
import { ExtractController } from './extract.controller'
import { ExtractService } from './extract.service'
import { OcrSupportModule } from './ocr-support.module'

/**
 * OCR 插件模块。
 *
 * OCR 引擎、PDF/图像工具与文档解析器均由本插件持有，
 * 通过 `OcrSupportModule` 共享给 hr / receipts 插件。
 */
@Module({
  imports: [OcrSupportModule],
  controllers: [OcrController, ExtractController],
  providers: [ExtractService],
  exports: [OcrSupportModule],
})
export class OcrPluginModule {}
