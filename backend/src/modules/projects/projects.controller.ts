import {
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
} from '@nestjs/common'
import { ProjectsService } from './projects.service'
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto'
import { PaginationQueryDto } from '../../common/dto/pagination.dto'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { Operation } from '../../common/decorators/operation.decorator'

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @RequirePermissions('settings:project')
  @Operation('查询项目列表')
  findAll(@Query() query: PaginationQueryDto) {
    return this.projectsService.findAll(query)
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