/**
 * Vault 状态查询（无任何口令/解锁接口）。
 *
 * 前端只在启动时读一次：若返回 `legacy: true`，说明当前是旧版主密码库，
 * 转换壳会接管并渲染一次性转换页；正常启动后这里恒为 `legacy: false`。
 */
import { Controller, Get } from '@nestjs/common'
import { Public } from '../common/decorators/public.decorator'
import { isLegacyVaultMeta, readVaultMeta } from '../sdk/vault'
import { vaultKeyFilePath } from './key-file'

@Controller('vault')
export class VaultController {
  /** 当前加密状态与密钥文件位置 */
  @Public()
  @Get('status')
  status(): {
    enabled: boolean
    legacy: boolean
    migrating: boolean
    keyFile: string
  } {
    const meta = readVaultMeta()
    return {
      enabled: !!meta && meta.enabled !== false,
      legacy: isLegacyVaultMeta(meta),
      migrating: meta?.enabled === 'migrating',
      keyFile: vaultKeyFilePath(),
    }
  }
}
