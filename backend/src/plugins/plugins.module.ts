import { Module } from '@nestjs/common'
import { PluginsService } from './plugins.service'
import {
  MarketController,
  PluginAssetsController,
  PluginsController,
} from './plugins.controller'
import { RemoteMarketService } from './remote/remote-market.service'
import { RemoteMarketController } from './remote/remote-market.controller'

/**
 * 插件运行时模块（内核 C10）。
 *
 * 提供市场目录、安装/启停/卸载、已启用清单与前端静态资源托管；
 * RemoteMarketService 对接独立服务端 boki-market（拉索引/验签/下载/校验/安装）。
 * 注意：本模块只管理插件生命周期，插件自身的 Nest 模块由 AppModule 动态注册。
 */
@Module({
  controllers: [
    PluginsController,
    
    MarketController,
    
    PluginAssetsController,
    RemoteMarketController,
  ],
  providers: [PluginsService, RemoteMarketService],
  exports: [PluginsService, RemoteMarketService],
})
export class PluginsModule {}
