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
  Req,
} from '@nestjs/common'
import type { Request } from 'express'
import { CompaniesService } from './companies.service'
import {
  AddCompanyMemberDto,
  CreateCompanyDto,
  SetCompanyMemberDto,
  UpdateCompanyDto,
} from './dto/company.dto'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { RequireRoles } from '../../common/decorators/roles.decorator'
import { Operation } from '../../common/decorators/operation.decorator'
import { getCurrentUser } from '../../common/utils/request.util'

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  /**
   * 当前用户可管理的公司列表（登录后用于切换公司）
   */
  @Get()
  @Operation('查询我可管理的公司')
  findMine(@Req() req: Request) {
    return this.companiesService.findMyCompanies(getCurrentUser(req).sub)
  }

  /** 公司详情（含成员列表） */
  @Get(':id')
  @RequirePermissions('company:view')
  @Operation('查询公司详情')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.companiesService.findOne(id)
  }

  /** 新建记账公司 */
  @Post()
  @RequireRoles('admin')
  @Operation('新建记账公司')
  create(@Body() dto: CreateCompanyDto, @Req() req: Request) {
    return this.companiesService.create(dto, getCurrentUser(req).sub)
  }

  /** 编辑公司 */
  @Put(':id')
  @RequirePermissions('company:update')
  @Operation('编辑记账公司')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateCompanyDto) {
    return this.companiesService.update(id, dto)
  }

  /** 删除公司。无业务数据可直接删除；force=true 时连同全部业务数据一并删除（不可恢复） */
  @Delete(':id')
  @RequireRoles('admin')
  @Operation('删除记账公司')
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
    @Query('force') force?: string,
  ) {
    return this.companiesService.remove(id, getCurrentUser(req).sub, force === 'true')
  }

  // ==================== 成员授权 ====================

  /** 追加授权用户 */
  @Post(':id/members')
  @RequirePermissions('company:member')
  @Operation('添加公司成员')
  addMember(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddCompanyMemberDto,
  ) {
    return this.companiesService.addMembers(id, dto.userIds ?? [])
  }

  /** 全量设置成员（并可同时覆盖角色） */
  @Put(':id/members')
  @RequirePermissions('company:member')
  @Operation('设置公司成员')
  setMembers(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: SetCompanyMemberDto) {
    return this.companiesService.setMembers(id, dto)
  }

  /** 取消授权 */
  @Delete(':id/members/:userId')
  @RequirePermissions('company:member')
  @Operation('移除公司成员')
  removeMember(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.companiesService.removeMember(id, userId)
  }

  /** 供日志/审计使用：切换公司后刷新缓存 */
  @Post(':id/ping')
  @HttpCode(HttpStatus.OK)
  @Operation('校验公司可访问性')
  async ping(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request) {
    await this.companiesService.assertUsable(id, getCurrentUser(req).sub)
    return { message: '可访问' }
  }
}