import { Module } from '@nestjs/common'
import { OcrModule } from '../ocr/ocr.module'
import { ReceiptsModule } from '../receipts/receipts.module'
import { ExtractController } from './extract.controller'
import { ExtractService } from './extract.service'

@Module({
  imports: [OcrModule, ReceiptsModule],
  controllers: [ExtractController],
  providers: [ExtractService],
})
export class ExtractModule {}