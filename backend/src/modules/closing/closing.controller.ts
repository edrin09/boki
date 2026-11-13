import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common'
import type { Request } from 'express'
import { ClosingService } from './closing.service'
import { ClosingExecuteDto, ClosingQueryDto } from './dto/closing.dto'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { Operation } from '../../common/decorators/operation.decorator'
import { getCurrentUser } from '../../common/utils/request.util'

@Controller('closing')
export class ClosingController {
  constructor(private readonly closingService: ClosingService) {}

  /** 结转预览：本期损益余额与将生成的结转分录 */
  @Get('preview')
  @RequirePermissions('books:closing')
  @Operation('期末结转预览')
  preview(@Query() query: ClosingQueryDto) {
    return this.closingService.preview(query)
  }

  /** 执行结转：生成已审核的结转凭证 */
  @Post('execute')
  @RequirePermissions('books:closing')
  @Operation('期末结转损益')
  execute(@Body() dto: ClosingExecuteDto, @Req() req: Request) {
    const user = getCurrentUser(req)
    return this.closingService.execute(dto, { id: user.sub, nickname: user.nickname })
  }

  /** 取消结转：删除本期结转凭证 */
  @Post('rollback')
  @RequirePermissions('books:closing')
  @Operation('取消期末结转')
  rollback(@Body() dto: ClosingQueryDto) {
    return this.closingService.rollback(dto)
  }
}
