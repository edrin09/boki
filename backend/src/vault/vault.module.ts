/**
 * Vault 内核模块。
 *
 * 导出 `VaultService` 供 vault 插件调用（插件 `imports: [VaultModule]`）。
 * 本模块**不连库**、不依赖加密是否启用 —— 未加密部署时它只是一个状态查询器。
 */
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SysConfig } from '../entities/sys-config.entity'
import { VaultController } from './vault.controller'
import { VaultService } from './vault.service'

@Module({
  imports: [TypeOrmModule.forFeature([SysConfig])],
  controllers: [VaultController],
  providers: [VaultService],
  exports: [VaultService],
})
export class VaultModule {}
