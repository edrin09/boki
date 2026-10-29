/**
 * 远程插件市场接口（对接 boki-market 独立服务端）。
 *
 * 查询类接口与本地已装插件保持一致，走全局 JWT 保护；
 * 安装动作需要 system:plugin 权限。
 *
 * 这是唯一的插件市场接口：未配置 PLUGIN_MARKET_URL / 公钥、市场不可达、
 * 验签失败都由服务层抛错（503/400），前端原样展示，不再回退任何本地目录。
 */
import {
  Body,
  Controller,
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

  @Get('status')
  @Operation('查询远程插件市场状态')
  status() {
    return this.remote.status()
  }

  @Get('catalog')
  @Operation('查询远程插件市场目录（验签索引 + 已安装状态合并）')
  async catalog() {
    return this.remote.remoteCatalog()
  }

  @Post('plugins/:id/install')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('system:plugin')
  @Operation('从远程市场安装/更新插件')
  async install(@Param('id') id: string, @Body() body?: InstallRemoteBody) {
    return this.remote.install(id, body?.licenseKey)
  }
}
