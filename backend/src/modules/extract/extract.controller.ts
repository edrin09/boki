import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { ExtractService } from './extract.service'
import type { ExtractTarget } from './field-map'
import { Operation } from '../../common/decorators/operation.decorator'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'

const ALLOWED_MIME = /^(image\/(jpeg|png|webp|bmp|tiff)|application\/pdf)$/
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

/**
 * 证件抽取：路由挂在 /ocr 下，与识别引擎同属「识别」语义。
 * 实现放在独立模块，避免 ocr ↔ receipts 的模块环依赖。
 */
@Controller('ocr')
export class ExtractController {
  constructor(private readonly service: ExtractService) {}

  @Post('extract')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  @RequirePermissions('ocr:extract')
  @Operation('识别证件并抽取档案字段')
  extract(@UploadedFile() file: Express.Multer.File, @Query('target') target?: string) {
    if (!file) throw new BadRequestException('请上传证件图片或 PDF 文件')
    if (!file.size) throw new BadRequestException('上传的文件为空')
    if (!ALLOWED_MIME.test(file.mimetype)) {
      throw new BadRequestException(`不支持的文件类型: ${file.originalname}（${file.mimetype}）`)
    }
    if (target !== 'partner' && target !== 'employee') {
      throw new BadRequestException('target 仅支持 partner 或 employee')
    }
    if (!this.service.isReady()) {
      throw new BadRequestException(this.service.notReadyMessage())
    }
    return this.service.extract(file.buffer, file.mimetype, file.originalname, target as ExtractTarget)
  }
}