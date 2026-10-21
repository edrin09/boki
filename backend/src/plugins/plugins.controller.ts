import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common'
import type { Response } from 'express'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { PluginsService } from './plugins.service'
import { pluginsRootDir } from './plugin.paths'
import { Public } from '../common/decorators/public.decorator'
import { RequirePermissions } from '../common/decorators/permissions.decorator'
import { Operation } from '../common/decorators/operation.decorator'
import { SkipWrap } from '../common/decorators/skip-wrap.decorator'

@Controller('plugins')
export class PluginsController {
  constructor(private readonly service: PluginsService) {}

  @Get()
  @Operation('查询已安装插件')
  installed() {
    return this.service.installed()
  }

  @Get('manifests')
  @Operation('查询已启用插件清单')
  manifests() {
    return this.service.enabledManifests()
  }

  @Get(':id')
  @Operation('查询插件详情')
  detail(@Param('id') id: string) {
    return this.service.detail(id)
  }

  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('system:plugin')
  @Operation('启用插件')
  enable(@Param('id') id: string) {
    return this.service.enable(id)
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('system:plugin')
  @Operation('停用插件')
  disable(@Param('id') id: string) {
    return this.service.disable(id)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('system:plugin')
  @Operation('卸载插件')
  uninstall(@Param('id') id: string, @Query('keepData') keepData?: string) {
    return this.service.uninstall(id, keepData !== 'false')
  }
}

@Controller('market')
export class MarketController {
  constructor(private readonly service: PluginsService) {}

  @Get('catalog')
  @Operation('查询插件市场')
  catalog() {
    return this.service.catalog()
  }

  @Get('plugins/:id')
  @Operation('查询市场插件详情')
  detail(@Param('id') id: string) {
    return this.service.detail(id)
  }

  @Post('plugins/:id/install')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('system:plugin')
  @Operation('安装插件')
  install(@Param('id') id: string) {
    return this.service.install(id)
  }
}

@Controller('plugin-assets')
export class PluginAssetsController {
  @Get(':id/*path')
  @Public()
  @SkipWrap()
  assets(@Param('id') id: string, @Param('path') rawPath: string | string[], @Res() res: Response) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      res.status(400).json({ code: 400, message: '非法插件 ID' })
      return
    }
    const rel = Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath ?? '')
    const root = path.resolve(pluginsRootDir(), id)
    const file = path.resolve(root, rel)
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.status(404).json({ code: 404, message: '资源不存在' })
      return
    }
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(file)
  }
}
