import { Module } from '@nestjs/common'
import { PluginsService } from './plugins.service'
import {
  MarketController,
  PluginAssetsController,
  PluginsController,
} from './plugins.controller'

/**
 * 插件运行时模块（内核 C10）。
 *
 * 提供市场目录、安装/启停/卸载、已启用清单与前端静态资源托管。
 * 注意：本模块只管理插件生命周期，插件自身的 Nest 模块由 AppModule 动态注册。
 */
@Module({
  controllers: [PluginsController, MarketController, PluginAssetsController],
  providers: [PluginsService],
  exports: [PluginsService],
})
export class PluginsModule {}
