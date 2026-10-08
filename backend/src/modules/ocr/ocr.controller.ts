import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { OcrEngine } from './ocr.engine'
import { RecognizeOptionsDto } from './dto/recognize.dto'
import { Operation } from '../../common/decorators/operation.decorator'
import { missingModels, resolveModelDir } from './ocr-model.path'

const IMAGE_MIME = /^image\/(jpeg|png|webp|bmp|tiff)$/
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

@Controller('ocr')
export class OcrController {
  constructor(private readonly engine: OcrEngine) {}

  @Get('status')
  @Operation('查询 OCR 引擎状态')
  status() {
    return {
      ready: this.engine.isReady(),
      modelDir: resolveModelDir(),
      missing: missingModels(),
    }
  }

  @Post('recognize')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      // 中文文件名按 UTF-8 解码，避免默认 latin1 导致乱码
      defParamCharset: 'utf8',
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  @Operation('识别图片文字')
  recognize(@UploadedFile() file: Express.Multer.File, @Body() dto: RecognizeOptionsDto) {
    if (!file) throw new BadRequestException('请上传待识别的图片文件')
    if (!IMAGE_MIME.test(file.mimetype)) {
      throw new BadRequestException(`暂不支持的文件类型: ${file.mimetype}`)
    }
    if (!this.engine.isReady()) {
      throw new BadRequestException(
        `OCR 模型未就绪，缺失文件: ${missingModels().join(', ') || '无'}，模型目录: ${resolveModelDir()}`,
      )
    }
    return this.engine.recognize(file.buffer, dto)
  }
}