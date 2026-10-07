import { Module } from '@nestjs/common'
import { OcrController } from './ocr.controller'
import { OcrEngine } from './ocr.engine'

@Module({
  controllers: [OcrController],
  providers: [OcrEngine],
  exports: [OcrEngine],
})
export class OcrModule {}