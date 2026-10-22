/**
 * Vault 内核接口。
 *
 * 只暴露**内核自己**需要的三个接口；开启加密 / 改主密码 / 恢复码等
 * 「策略型」能力由 vault 插件提供（见 marketplace/plugins/vault）。
 *
 * 这样切分的原因：拔掉插件后，内核仍必须能完成
 * 「查询状态 → 解锁 → 锁定」这条最基本链路。
 */
import { Body, Controller, Get, Post } from '@nestjs/common'
import { Public } from '../common/decorators/public.decorator'
import { VaultService } from './vault.service'
import { VaultUnlockDto } from './dto/vault.dto'

@Controller('vault')
export class VaultController {
  constructor(private readonly vaultService: VaultService) {}

  /**
   * 加密状态。
   *
   * @Public 前端在挂载路由前就要知道是否需要显示解锁页
   */
  @Public()
  @Get('status')
  status() {
    return this.vaultService.status()
  }

  /**
   * 解锁（进程内锁定后的重新解锁）。
   *
   * @Public 解锁时用户还没有登录态
   */
  @Public()
  @Post('unlock')
  unlock(@Body() dto: VaultUnlockDto) {
    return this.vaultService.unlock({ password: dto.password, recoveryCode: dto.recoveryCode })
  }

  /** 立即锁定（丢弃内存密钥并关闭数据库连接） */
  @Post('lock')
  lock() {
    return this.vaultService.lock()
  }
}
