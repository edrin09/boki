/** CLI 测试辅助：spawn marketctl、生成测试插件目录、生成 Ed25519 密钥。 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const CLI = path.join(CLI_ROOT, 'cli', 'marketctl.mjs')

const MARKET_ENV_KEYS = [
  'MARKET_URL',
  'MARKET_ADMIN_URL',
  'MARKET_PUBLIC_BASE_URL',
  'MARKET_ADMIN_TOKEN',
  'PLUGIN_MARKET_PRIVATE_KEY',
  'PLUGIN_MARKET_KEY_ID',
  'PLUGIN_MARKET_PLUGIN_ROOT',
  'PLUGIN_MARKET_DIST_DIR',
]

export function runCli(args, { env = {}, cwd = CLI_ROOT } = {}) {
  const merged = { ...process.env, MARKETCTL_DEBUG: '0' }
  for (const key of MARKET_ENV_KEYS) delete merged[key]
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || value === null) delete merged[key]
    else merged[key] = String(value)
  }

  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    env: merged,
    encoding: 'utf8',
    timeout: 120_000,
  })
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  }
}

export function parseCliJson(result) {
  if (result.status !== 0) {
    throw new Error(`CLI 退出码 ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
  }
  const text = result.stdout.trim()
  if (!text) throw new Error(`CLI 没有输出 JSON（stderr: ${result.stderr}）`)
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`CLI 输出不是 JSON：${error.message}\n${text}`)
  }
}

export function makeKeyPair(keyId = 'cli-key') {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  const publicDer = publicKey.export({ type: 'spki', format: 'der' })
  const privateDer = privateKey.export({ type: 'pkcs8', format: 'der' })
  return {
    keyId,
    publicKeyBase64: publicDer.subarray(publicDer.length - 32).toString('base64'),
    seedBase64: privateDer.subarray(privateDer.length - 32).toString('base64'),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    sign(payload) {
      return crypto.sign(null, Buffer.from(payload), privateKey).toString('base64')
    },
  }
}

/**
 * 生成一个包含「应打包 / 应排除」文件的插件目录。
 * 目录名必须等于 manifest.id（pack 会校验）。
 */
export function writePlugin(root, { id = 'banks', name = '资金账户', version = '1.0.0' } = {}) {
  const dir = path.join(root, id)
  fs.mkdirSync(path.join(dir, 'client', 'pages'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'server', 'modules'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'node_modules', 'dep'), { recursive: true })

  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify(
      {
        id,
        name,
        version,
        apiVersion: '^1.0.0',
        engines: { boki: '>=1.0.0' },
        kind: 'domain',
        trust: 'official',
        license: 'Apache-2.0',
        description: `${name} 测试插件`,
        contributes: { server: 'server/index.js', client: 'client/index.js' },
      },
      null,
      2,
    ),
  )
  fs.writeFileSync(path.join(dir, 'client', 'index.js'), 'export default { name: "fixture" }\n')
  fs.writeFileSync(path.join(dir, 'client', 'style.css'), '.fixture{display:none}\n')
  fs.writeFileSync(path.join(dir, 'client', 'pages', 'index.vue'), '<template><div /></template>\n')
  fs.writeFileSync(path.join(dir, 'server', 'index.js'), 'export const ready = true\n')
  fs.writeFileSync(path.join(dir, 'README.md'), '# fixture\n')

  // 以下必须被排除
  fs.writeFileSync(path.join(dir, 'client', 'index.ts'), 'export default {}\n')
  fs.writeFileSync(path.join(dir, 'client', 'index.js.map'), '{"version":3}\n')
  fs.writeFileSync(path.join(dir, 'server', 'index.ts'), 'export const ready: boolean = true\n')
  fs.writeFileSync(path.join(dir, 'server', 'modules', 'debug.ts'), 'export {}\n')
  fs.writeFileSync(path.join(dir, 'node_modules', 'dep', 'index.js'), 'module.exports = 1\n')
  fs.writeFileSync(path.join(dir, '.env'), 'SECRET=should-not-ship\n')
  fs.writeFileSync(path.join(dir, '.DS_Store'), 'junk')
  fs.writeFileSync(path.join(dir, 'backup.zip'), 'not-a-real-zip')

  return dir
}
