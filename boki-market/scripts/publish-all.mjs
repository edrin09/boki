/**
 * 一键重发全部官方插件（从 boki-market/plugins 逐个 publish）。
 *
 * 用途：市场服务端清库重置后，把全部插件按当前 manifest 重新发布并激活快照。
 * 注意：服务端已有同版本记录时会 409（禁止同版本换包），所以本脚本只在
 *       「服务端 versions 表已清空」的前提下可完整跑通。
 *
 * 用法：
 *   MARKET_URL=http://<市场地址> PLUGIN_MARKET_PRIVATE_KEY=$(cat dist/keys/key-1.private) \
 *     node scripts/publish-all.mjs
 *
 * 可选参数：
 *   --only <id1,id2,...>  只发布指定插件
 *   --json                透传 marketctl 的 --json（输出机器可读结果）
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const pluginsDir = path.join(repoRoot, 'plugins')

const args = process.argv.slice(2)
const onlyIdx = args.indexOf('--only')
const only =
  onlyIdx >= 0 && args[onlyIdx + 1]
    ? args[onlyIdx + 1].split(',').map((s) => s.trim()).filter(Boolean)
    : null
const passJson = args.includes('--json') ? ['--json'] : []

const ids = fs
  .readdirSync(pluginsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(pluginsDir, d.name, 'manifest.json')))
  .map((d) => d.name)
  .sort()

const failed = []
for (const id of ids) {
  if (only && !only.includes(id)) continue
  const manifest = JSON.parse(fs.readFileSync(path.join(pluginsDir, id, 'manifest.json'), 'utf8'))
  console.log(`\n==> publish ${id}@${manifest.version}`)
  const result = spawnSync(process.execPath, [path.join(repoRoot, 'cli', 'marketctl.mjs'), 'publish', '--plugin', id, ...passJson], {
    stdio: 'inherit',
    env: process.env,
  })
  if (result.status !== 0) {
    failed.push(id)
    console.error(`!! ${id} 发布失败（exit ${result.status}）`)
  }
}

console.log(`\n完成：${ids.length - failed.length}/${ids.length} 成功${failed.length ? `；失败：${failed.join(', ')}` : ''}`)
process.exit(failed.length ? 1 : 0)
