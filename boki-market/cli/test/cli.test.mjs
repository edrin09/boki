import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  TEST_TOKEN,
  adminFetch,
  createPlugin,
  makeMarket,
  setPluginCategories,
} from '../../server/test/helpers.mjs'
import { verifyDetachedSignature } from '../../server/src/lib/signature.mjs'
import { sha256Hex } from '../lib/pack.mjs'
import { readZip } from '../lib/zip.mjs'
import { makeKeyPair, parseCliJson, runCli, writePlugin } from './helpers.mjs'

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'boki-marketctl-e2e-'))
}

function baseEnv(base, keys, distDir) {
  return {
    MARKET_URL: base,
    MARKET_ADMIN_TOKEN: TEST_TOKEN,
    PLUGIN_MARKET_PRIVATE_KEY: keys.seedBase64,
    PLUGIN_MARKET_KEY_ID: keys.keyId,
    PLUGIN_MARKET_DIST_DIR: distDir,
  }
}

test('publish：一条命令完成 pack → release → 上架 → candidate → sign → activate', async (t) => {
  const keys = makeKeyPair('cli-key')
  const ctx = await makeMarket(t, { MARKET_PUBLIC_KEYS: `${keys.keyId}:${keys.publicKeyBase64}` })
  const { base, app } = ctx

  const dir = tempDir()
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))

  const pluginDir = writePlugin(dir, { id: 'banks', name: '资金账户' })
  const distDir = path.join(dir, 'dist')
  const env = baseEnv(base, keys, distDir)

  // 插件元数据与分类由管理端先建好（P2 CLI 不负责建插件）
  assert.equal((await createPlugin(base, { id: 'banks', name: '资金账户' })).status < 300, true)
  assert.equal((await setPluginCategories(base, 'banks')).status, 200)

  // dry-run：只打包，不联网、不读私钥
  const dry = parseCliJson(
    runCli(
      ['publish', '--plugin', pluginDir, '--dry-run', '--json'],
      { env: { PLUGIN_MARKET_DIST_DIR: distDir } },
    ),
  )
  assert.equal(dry.dryRun, true)
  assert.equal(dry.packed.pluginId, 'banks')
  assert.equal(dry.status, 'published')
  assert.deepEqual(dry.steps, ['release', 'status', 'candidate', 'sign', 'activate'])

  const result = runCli(
    ['publish', '--plugin', pluginDir, '--status', 'published', '--json'],
    { env },
  )
  const published = parseCliJson(result)
  assert.equal(published.released.pluginId, 'banks')
  assert.equal(published.released.version, '1.0.0')
  assert.equal(published.status.status, 'published')
  assert.equal(published.activated.version, 1)
  assert.equal(published.activated.pluginCount, 1)
  assert.equal(published.signed.keyId, 'cli-key')
  assert.equal(published.signed.publicKey, keys.publicKeyBase64)
  assert.equal(fs.existsSync(published.candidate.file), true)
  assert.equal(fs.existsSync(published.signed.file), true)

  // 服务端保存的签名快照必须能通过客户端公钥验签
  const row = app.ctx.db
    .prepare("SELECT raw, signature, key_id FROM index_snapshots WHERE status = 'active'")
    .get()
  assert.equal(row.key_id, 'cli-key')
  assert.equal(verifyDetachedSignature(row.raw, row.signature, keys.publicKeyBase64), true)
  assert.equal(sha256Hex(row.raw), published.activated.contentHash)

  const indexResponse = await fetch(`${base}/v1/index`)
  assert.equal(indexResponse.status, 200)
  const index = JSON.parse(await indexResponse.text())
  assert.equal(index.version, 2)
  assert.equal(index.plugins.length, 1)
  assert.equal(index.plugins[0].id, 'banks')
  assert.equal(index.plugins[0].version, '1.0.0')
  assert.equal(index.plugins[0].category, 'function')

  // 审计日志必须能追溯到发布与激活
  const audit = await adminFetch(base, '/v1/admin/audit?limit=100')
  assert.equal(audit.status, 200)
  const actions = audit.json.audit.map((item) => item.action)
  assert.ok(actions.includes('release.create'), `缺少 release.create：${actions.join(',')}`)
  assert.ok(actions.includes('index.activate'), `缺少 index.activate：${actions.join(',')}`)

  // 下载按签名索引发货；zip 内不含源码/依赖/私密文件
  const download = await fetch(index.plugins[0].download)
  assert.equal(download.status, 200)
  const zip = Buffer.from(await download.arrayBuffer())
  assert.equal(sha256Hex(zip), index.plugins[0].sha256)
  const entries = readZip(zip)
  assert.ok(entries.has('manifest.json'))
  assert.ok(entries.has('client/index.js'))
  assert.ok(!entries.has('client/index.ts'))
  assert.ok(!entries.has('client/index.js.map'))
  assert.ok(![...entries.keys()].some((name) => name.startsWith('node_modules/')))
  assert.ok(!entries.has('.env'))
})

test('分步链路：pack → release → candidate → sign → activate，以及 license 签发/校验/吊销', async (t) => {
  const keys = makeKeyPair('step-key')
  const ctx = await makeMarket(t, { MARKET_PUBLIC_KEYS: `${keys.keyId}:${keys.publicKeyBase64}` })
  const { base } = ctx

  const dir = tempDir()
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))

  const pluginDir = writePlugin(dir, { id: 'ar-ap', name: '应收应付', version: '1.0.0' })
  const distDir = path.join(dir, 'dist')
  const env = baseEnv(base, keys, distDir)

  assert.equal((await createPlugin(base, { id: 'ar-ap', name: '应收应付', price: 9900 })).status < 300, true)
  assert.equal((await setPluginCategories(base, 'ar-ap')).status, 200)

  const packed = parseCliJson(runCli(['pack', '--plugin', pluginDir, '--json'], { env }))
  const released = parseCliJson(runCli(['release', '--zip', packed.zipPath, '--json'], { env }))
  assert.equal(released.sha256, packed.sha256)

  const status = runCli(['activate', '--raw', 'missing.json', '--json'], { env })
  assert.equal(status.status, 1)

  // 上架：CLI 没有单独的 status 命令，用分步链路时通过管理接口确认（模拟管理员操作）
  const publishStatus = await adminFetch(base, '/v1/admin/plugins/ar-ap/status', {
    method: 'PUT',
    body: { status: 'published' },
  })
  assert.equal(publishStatus.status, 200)

  const candidateFile = path.join(distDir, 'candidate.json')
  const candidate = parseCliJson(
    runCli(['candidate', '--out', candidateFile, '--json'], { env }),
  )
  assert.equal(candidate.snapshotVersion, 1)
  assert.equal(candidate.pluginCount, 1)
  assert.equal(fs.existsSync(candidateFile), true)

  // 没有私钥时明确失败，且不产生签名文件
  const noKey = runCli(['sign', '--raw', candidateFile, '--json'], {
    env: { ...env, PLUGIN_MARKET_PRIVATE_KEY: undefined },
  })
  assert.equal(noKey.status, 1)
  assert.match(noKey.stderr, /PLUGIN_MARKET_PRIVATE_KEY/)

  const signatureFile = path.join(distDir, 'candidate.sig.json')
  const signed = parseCliJson(
    runCli(['sign', '--raw', candidateFile, '--out', signatureFile, '--json'], { env }),
  )
  assert.equal(signed.contentHash, candidate.contentHash)
  assert.equal(signed.snapshotVersion, 1)

  const activated = parseCliJson(
    runCli(
      ['activate', '--raw', candidateFile, '--signature-file', signatureFile, '--json'],
      { env },
    ),
  )
  assert.equal(activated.version, 1)
  assert.equal(activated.pluginCount, 1)

  // 篡改候选后重新签名 → 服务端拒绝（签名内容与库内/元数据不一致）
  const tamperedFile = path.join(distDir, 'tampered.json')
  const candidateJson = JSON.parse(fs.readFileSync(candidateFile, 'utf8'))
  candidateJson.raw = candidateJson.raw.replace('"price": 9900', '"price": 0')
  fs.writeFileSync(tamperedFile, JSON.stringify(candidateJson, null, 2))
  const tamperedSign = runCli(['sign', '--raw', tamperedFile, '--json'], {
    env: { ...env, PLUGIN_MARKET_DIST_DIR: distDir },
  })
  assert.equal(tamperedSign.status, 1)
  assert.match(tamperedSign.stderr, /contentHash/)

  // 授权：签发 → 校验 → 吊销 → 校验失败
  const license = parseCliJson(
    runCli(['license', 'issue', '--plugin', 'ar-ap', '--plan', 'perpetual', '--json'], { env }),
  )
  assert.match(license.key, /^v1\./)
  assert.equal(license.pluginId, 'ar-ap')
  assert.equal(license.status, 'active')

  const valid = parseCliJson(
    runCli(['license', 'verify', '--key', license.key, '--plugin', 'ar-ap', '--json'], { env }),
  )
  assert.equal(valid.valid, true)

  const revoked = parseCliJson(
    runCli(['license', 'revoke', '--id', license.id, '--json'], { env }),
  )
  assert.equal(revoked.status, 'revoked')

  const invalid = parseCliJson(
    runCli(['license', 'verify', '--key', license.key, '--plugin', 'ar-ap', '--json'], { env }),
  )
  assert.equal(invalid.valid, false)
  assert.equal(invalid.reason, 'revoked')

  // 订阅缺 expiresAt → 参数/业务错误
  const badPlan = runCli(['license', 'issue', '--plugin', 'ar-ap', '--plan', 'subscription', '--json'], {
    env,
  })
  assert.equal(badPlan.status, 1)
  assert.match(badPlan.stderr, /expiresAt/)
})

test('参数与错误处理：未知命令/选项、缺地址、缺令牌', () => {
  const unknownCommand = runCli(['nope'])
  assert.equal(unknownCommand.status, 2)
  assert.match(unknownCommand.stderr, /未知命令/)

  const unknownOption = runCli(['pack', '--wat', 'x'])
  assert.equal(unknownOption.status, 2)
  assert.match(unknownOption.stderr, /未知选项/)

  const missingUrl = runCli(['candidate', '--json'])
  assert.equal(missingUrl.status, 2)
  assert.match(missingUrl.stderr, /MARKET_URL/)

  const missingToken = runCli(['candidate', '--url', 'http://127.0.0.1:1', '--json'])
  assert.equal(missingToken.status, 2)
  assert.match(missingToken.stderr, /MARKET_ADMIN_TOKEN/)

  const help = runCli(['--help'])
  assert.equal(help.status, 0)
  assert.match(help.stdout, /publish/)
  assert.match(help.stdout, /PLUGIN_MARKET_PRIVATE_KEY/)

  const commandHelp = runCli(['publish', '--help'])
  assert.equal(commandHelp.status, 0)
  assert.match(commandHelp.stdout, /--dry-run/)
})
