import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { ProjectsService } from './projects.service'
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto'
import { PaginationQueryDto } from '@core/common/dto/pagination.dto'
import { RequirePermissions } from '@core/common/decorators/permissions.decorator'
import { Operation } from '@core/common/decorators/operation.decorator'

const CONTRACT_FILE_LIMIT = 20 * 1024 * 1024

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @RequirePermissions('settings:project')
  @Operation('查询项目列表')
  findAll(@Query() query: PaginationQueryDto) {
    return this.projectsService.findAll(query)
  }

  @Get('ledger')
  @RequirePermissions('settings:project')
  @Operation('项目合同台账')
  ledger() {
    return this.projectsService.ledger()
  }

  @Post('parse-contract')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      defParamCharset: 'utf8',
      limits: { fileSize: CONTRACT_FILE_LIMIT },
    }),
  )
  @RequirePermissions('settings:project')
  @Operation('导入合同PDF自动识别')
  parseContract(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('请选择合同 PDF 文件')
    if (!/pdf$/i.test(file.mimetype) && !/\.pdf$/i.test(file.originalname)) {
      throw new BadRequestException('仅支持 PDF 格式的合同文件')
    }
    return this.projectsService.parseContract(file.buffer)
  }

  @Get('options')
  @Operation('查询项目下拉选项')
  options() {
    return this.projectsService.findOptions()
  }

  @Get(':id')
  @RequirePermissions('settings:project')
  @Operation('查询项目详情')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.findOne(id)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('project:create')
  @Operation('新增项目')
  create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto)
  }

  @Put(':id')
  @RequirePermissions('project:update')
  @Operation('编辑项目')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('project:delete')
  @Operation('删除项目')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.remove(id)
  }
}