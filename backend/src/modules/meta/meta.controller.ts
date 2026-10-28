import * as fs from 'node:fs'
import * as path from 'node:path'
import { Controller, Get } from '@nestjs/common'
import { Public } from '../../common/decorators/public.decorator'
import { SkipWrap } from '../../common/decorators/skip-wrap.decorator'
import { Operation } from '../../common/decorators/operation.decorator'

/**
 * 应用身份与联系方式。
 *
 * 数据源是仓库根 .env（APP_TITLE / OFFICIAL_SITE / PUBLISHER_NAME /
 * CONTACT_EMAIL / CONTACT_PHONE / CONTACT_WECHAT），经 ConfigModule 加载；
 * 登录页署名、关于信息等前端消费点统一从这里取，避免多处硬编码漂移。
 */
@Controller('meta')
export class MetaController {
  @Get()
  @Public()
  @SkipWrap()
  @Operation('查询应用身份与联系方式')
  getMeta() {
    let version = ''
    try {
      // dist/modules/meta → 上溯三级即 backend/，与 desktop/src/contact.js 同源不同端
      const pkg = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'),
      )
      version = pkg.version ?? ''
    } catch {
      version = ''
    }
    return {
      appTitle: process.env.APP_TITLE || 'BOKI',
      officialSite: process.env.OFFICIAL_SITE || '',
      publisher: process.env.PUBLISHER_NAME || '',
      email: process.env.CONTACT_EMAIL || '',
      phone: process.env.CONTACT_PHONE || '',
      wechat: process.env.CONTACT_WECHAT || '',
      version,
    }
  }
}
