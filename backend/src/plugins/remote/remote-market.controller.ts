/**
 * 远程插件市场接口（对接 boki-market 独立服务端）。
 *
 * 查询类接口与本地 catalog 保持一致的全局 JWT 保护；
 * 安装动作需要 system:plugin 权限，与本地安装一致。
 * PLUGIN_MARKET_URL 未配置时整个 Controller 报 503，前端按「本地目录」模式降级。
 */
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common'
import { RemoteMarketService } from './remote-market.service'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { Operation } from '../../common/decorators/operation.decorator'

interface InstallRemoteBody {
  /** 收费插件的授权码（v1.<payload>.<hmac>） */
  licenseKey?: string
}

@Controller('market/remote')
export class RemoteMarketController {
  constructor(private readonly remote: RemoteMarketService) {}

  private assertEnabled(): void {
    if (!this.remote.isEnabled()) {
      throw new ForbiddenException('未配置 PLUGIN_MARKET_URL，远程插件市场不可用')
    }
  }

  @Get('status')
  @Operation('查询远程插件市场状态')
  status() {
    return this.remote.status()
  }

  @Get('catalog')
  @Operation('查询远程插件市场目录（验签索引 + 已安装状态合并）')
  async catalog() {
    this.assertEnabled()
    return this.remote.remoteCatalog()
  }

  @Post('plugins/:id/install')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('system:plugin')
  @Operation('从远程市场安装/更新插件')
  async install(@Param('id') id: string, @Body() body?: InstallRemoteBody) {
    this.assertEnabled()
    return this.remote.install(id, body?.licenseKey)
  }
}
