/**
 * 远程插件市场联调脚本（对接本机 boki-market 实服务端）。
 *
 * 运行：
 *   1) cd boki-market && npm start            （先起市场服务端）
 *   2) cd backend && npx ts-node -r tsconfig-paths/register test/remote-market-live.ts
 *
 * 插件安装目录与索引缓存都指向临时目录（BOKI_PLUGINS_DIR / BOKI_MARKET_CACHE_DIR），
 * 完整走「下载 → sha256 → 解包 → 原子落盘 → 写 state」链路，不污染真实 data/plugins。
 */
process.env.PLUGIN_MARKET_URL = 'http://127.0.0.1:8789'
// 与市场端 MARKET_PUBLIC_KEYS 同源的验签公钥（key-1，本地 keygen 生成的冒烟钥）
process.env.PLUGIN_MARKET_PUBLIC_KEYS = 'key-1:RF8IB6sFNVsWizHLCoiMfvEmSa9uggIH4ic6KrSAQhs='
process.env.BOKI_MARKET_CACHE_DIR = 'D:/wwwroot/financial/backend/data/market-cache-test'
process.env.BOKI_PLUGINS_DIR = 'D:/wwwroot/financial/backend/data/plugins-remote-test'

import * as fs from 'node:fs'
import { RemoteMarketService } from '../src/plugins/remote/remote-market.service'

async function main(): Promise<void> {
  const service = new RemoteMarketService({
    install: async () => {
      throw new Error('本地降级不应被触发')
    },
  } as never)

  // 1. 健康检查
  const status = await service.status()
  console.log('1) status:', JSON.stringify(status))

  // 2. 拉索引 + Ed25519 验签（对随行头 x-boki-signature 校验原始字节）
  const fetched = await service.fetchIndex()
  console.log(
    `2) index: source=${fetched.source} verified=${fetched.verified} ` +
      `plugins=${fetched.index.plugins.length} categories=${(fetched.index.categories ?? []).map((c) => c.id).join(',')} ` +
      `market=${fetched.index.market} publishedAt=${fetched.index.publishedAt}`,
  )
  const banks = fetched.index.plugins.find((p) => p.id === 'banks')
  console.log(
    `   banks: v${banks?.version} sha256=${banks?.sha256?.slice(0, 12)}… size=${banks?.size}B download=${banks?.download}`,
  )

  // 3. 目录合并安装状态
  const catalog = await service.remoteCatalog()
  console.log(`3) catalog: ${catalog.plugins.length} row(s)`)
  for (const row of catalog.plugins) {
    console.log(
      `   ${row.manifest.id} v${row.manifest.version} [${row.category ?? '-'}] ` +
        `price=${row.price} installed=${row.installed}`,
    )
  }

  // 4. 远程安装（临时插件目录 → 全新安装）：下载 → sha256 → 解包 → 原子落盘 → 写 state
  const target = 'D:/wwwroot/financial/backend/data/plugins-remote-test/banks/manifest.json'
  const result = await service.install('banks')
  console.log('4) install:', JSON.stringify(result))

  // 5. 落盘核验：manifest 存在、id 一致、state 记录存在
  const manifest = JSON.parse(fs.readFileSync(target, 'utf8')) as { id: string; version: string }
  const state = JSON.parse(
    fs.readFileSync('D:/wwwroot/financial/backend/data/plugins-remote-test/state.json', 'utf8'),
  ) as { plugins: Record<string, { version: string; enabled?: boolean }> }
  console.log(
    `5) 落盘核验: manifest=${manifest.id}@${manifest.version} ` +
      `state=${state.plugins.banks?.version} 启用=${state.plugins.banks?.enabled}` +
      `（manifest 与 state 版本一致：${manifest.version === state.plugins.banks?.version}）`,
  )

  // 6. 二次安装：同版本 → 已安装跳过（不重复下载）
  const again = await service.install('banks')
  console.log('6) 二次安装（应直接启用，无重复下载）:', JSON.stringify(again))
}

main().catch((error) => {
  console.error('FAIL:', error)
  process.exit(1)
})
