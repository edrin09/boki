import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common'
import type { Request } from 'express'
import { SetupService } from './setup.service'
import { BootstrapCompanyDto } from './dto/bootstrap-company.dto'
import { RequireRoles } from '../../common/decorators/roles.decorator'
import { Operation } from '../../common/decorators/operation.decorator'
import { getCurrentUser } from '../../common/utils/request.util'

/**
 * 内核建账入口。
 *
 * 只在系统中还没有任何记账公司时可用；其余公司管理接口由
 * multi-company 插件提供（/companies）。这样零插件也能完成「建账套」。
 */
@Controller('companies')
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Post('bootstrap')
  @HttpCode(HttpStatus.CREATED)
  @RequireRoles('admin')
  @Operation('创建首个记账公司')
  bootstrap(@Body() dto: BootstrapCompanyDto, @Req() req: Request) {
    return this.setupService.bootstrap(dto, getCurrentUser(req).sub)
  }
}
