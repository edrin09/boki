/** 断源降级验证：市场服务端已停，fetchIndex 应回退本地缓存（degraded + source=cache） */
process.env.PLUGIN_MARKET_URL = 'http://127.0.0.1:8789'
process.env.PLUGIN_MARKET_PUBLIC_KEYS = 'key-1:RF8IB6sFNVsWizHLCoiMfvEmSa9uggIH4ic6KrSAQhs='
process.env.BOKI_MARKET_CACHE_DIR = 'D:/wwwroot/financial/backend/data/market-cache-test'
process.env.BOKI_PLUGINS_DIR = 'D:/wwwroot/financial/backend/data/plugins-remote-test'

import { RemoteMarketService } from '../src/plugins/remote/remote-market.service'

async function main(): Promise<void> {
  const service = new RemoteMarketService({ install: async () => undefined } as never)
  const fetched = await service.fetchIndex()
  console.log(
    `断源降级: source=${fetched.source} verified=${fetched.verified} degraded=${fetched.degraded} ` +
      `plugins=${fetched.index.plugins.length} error=${fetched.error ?? '-'}`,
  )
  if (fetched.source !== 'cache' || !fetched.degraded) {
    throw new Error('降级行为不符合预期')
  }
  console.log('OK：断源时使用本地缓存索引并向调用方透明标注')
}

main().catch((error) => {
  console.error('FAIL:', error)
  process.exit(1)
})
