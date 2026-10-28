/**
 * Vault 内核模块。
 *
 * 只暴露状态查询接口；密钥加载、库加密与旧库转换都发生在
 * `main.ts` 的 `prepareVault()` 里（早于 Nest 容器）。
 */
import { Module } from '@nestjs/common'
import { VaultController } from './vault.controller'

@Module({
  controllers: [VaultController],
})
export class VaultModule {}
