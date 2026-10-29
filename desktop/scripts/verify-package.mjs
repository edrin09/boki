/**
 * 打包产物端到端验证
 *
 * 直接以打包后的 node.exe + dist 启动后端（与 Electron 壳的拉起方式一致），
 * 在临时数据目录上复刻**全新安装**：插件目录为空 → 从远程插件市场安装 →
 * 重启后端 → 跑通「静态托管 → 登录 → 建账 → OCR 就绪 → 票据上传识别」。
 *
 * 这一步能拦住「装完才崩」的问题：原生模块缺失、模型未打进包、
 * 前端产物漏拷、JWT/市场地址注入不对。也顺带验证「客户端零插件 +
 * 全靠远程市场」这条新链路是通的。
 *
 * 用法：node scripts/verify-package.mjs
 */
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.resolve(__dirname, '..')
const repoRoot = path.resolve(desktopDir, '..')

const releaseDir = process.env.RELEASE_DIR
  ? path.resolve(desktopDir, process.env.RELEASE_DIR)
  : path.join(desktopDir, 'release')
const resources = path.join(releaseDir, 'win-unpacked', 'resources')
const serverDir = path.join(resources, 'server')
const PORT = Number(process.env.VERIFY_PORT || 19300)
const BASE = `http://127.0.0.1:${PORT}/api`

/** 出厂必装插件：多公司（建账入口）+ 票据（自动带出 ocr / hr 依赖） */
const MARKET_INSTALL = ['multi-company', 'receipts']

let passed = 0
let failed = 0

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1
    console.log(`  [通过] ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed += 1
    console.log(`  [失败] ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function request(urlPath, { method = 'GET', body, token } = {}) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null
    const req = http.request(
      `${BASE}${urlPath}`,
      {
        method,
        headers: {
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let text = ''
        res.on('data', (c) => (text += c))
        res.on('end', () => {
          let json = null
          try {
            json = text ? JSON.parse(text) : null
          } catch {
            json = null
          }
          resolve({ status: res.statusCode, json, text })
        })
      },
    )
    req.on('error', () => resolve({ status: 0, json: null, text: '' }))
    if (payload) req.write(payload)
    req.end()
  })
}

function requestRoot() {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/', timeout: 3000 }, (res) => {
      let text = ''
      res.on('data', (c) => (text += c))
      res.on('end', () => resolve({ status: res.statusCode, text }))
    })
    req.on('timeout', () => req.destroy())
    req.on('error', () => resolve({ status: 0, text: '' }))
  })
}

function waitReady(timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve) => {
    const attempt = () => {
      if (Date.now() > deadline) return resolve(false)
      request('/').then((r) => (r.status ? resolve(true) : setTimeout(attempt, 500)))
    }
    attempt()
  })
}

const unwrap = (b) => (b && typeof b === 'object' && 'data' in b ? b.data : b)

/**
 * 首次启动的空库还没有记账公司，业务接口会因缺少公司上下文而拒绝。
 * 这里按前端「创建记账公司」引导补齐：无公司则新建一家并切换令牌；
 * 已有公司则直接切换。
 */
async function ensureCompanyContext(token) {
  const mine = unwrap((await request('/companies', { token })).json)
  let companyId = Array.isArray(mine) && mine.length ? mine[0].id : null
  if (!companyId) {
    const created = await request('/companies', {
      method: 'POST',
      token,
      // taxpayerType 为 DTO 必填项（决定增值税记账口径），缺失会 400
      body: { name: '打包验证公司', taxNo: '91310000MA1FL2KX3T', taxpayerType: 'small_scale' },
    })
    companyId = unwrap(created.json)?.id ?? null
  }
  if (!companyId) return { token, companyId: null }
  const switched = await request('/auth/switch-company', {
    method: 'POST',
    token,
    body: { companyId },
  })
  return { token: unwrap(switched.json)?.accessToken || token, companyId }
}

async function main() {
  if (!fs.existsSync(path.join(serverDir, 'node.exe'))) {
    console.error(`未找到打包产物：${serverDir}\n请先执行 npm run pack（用 RELEASE_DIR 指定其它产物目录）`)
    process.exit(1)
  }

  // 出厂包必须是零插件：带着种子目录就等于把「自己的包」当市场，配置问题永远暴露不出来
  const leaked = [
    path.join(serverDir, 'data', 'plugins'),
    path.join(serverDir, 'marketplace'),
  ].filter((dir) => fs.existsSync(dir))
  check('打包产物不含随包插件/本地市场目录', leaked.length === 0, leaked.join(', '))

  const marketConfig = require(path.join(desktopDir, 'src', 'marketplace.js'))
  check('出厂已预置远程插件市场地址', Boolean(marketConfig.url), marketConfig.url || '未配置')
  check('出厂已预置插件市场验签公钥', Boolean(marketConfig.publicKeys))

  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-verify-'))
  // 全新安装 = 插件目录为空（不铺任何种子）
  const pluginsDir = path.join(dataRoot, 'plugins')
  fs.mkdirSync(pluginsDir, { recursive: true })
  console.log(`临时数据目录: ${dataRoot}`)
  console.log(`验证端口: ${PORT}\n`)

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    APP_PORT: String(PORT),
    APP_PREFIX: 'api',
    DB_DATABASE: path.join(dataRoot, 'data', 'financial.db'),
    DB_SYNCHRONIZE: 'true',
    UPLOAD_DIR: path.join(dataRoot, 'data', 'uploads'),
    OCR_MODEL_DIR: path.join(serverDir, 'models', 'ocr'),
    WEB_DIST_DIR: path.join(resources, 'web'),
    JWT_SECRET: 'verify-only-secret-not-for-production',
    JWT_EXPIRES_IN: '8h',
    CORS_ORIGIN: '*',
    // 与 desktop/src/server.js buildEnv 保持一致：可写插件目录 + 依赖解析链 + 远程市场
    BOKI_PLUGINS_DIR: pluginsDir,
    NODE_PATH: path.join(serverDir, 'node_modules'),
    PLUGIN_MARKET_URL: marketConfig.url,
    PLUGIN_MARKET_PUBLIC_KEYS: marketConfig.publicKeys,
  }

  let child = null
  let logs = []

  const stop = () =>
    new Promise((resolve) => {
      if (!child || child.exitCode !== null || child.signalCode !== null) return resolve()
      const target = child
      const timer = setTimeout(() => {
        try {
          target.kill('SIGKILL')
        } catch {
          // 已退出
        }
        resolve()
      }, 5000)
      target.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      try {
        target.kill()
      } catch {
        clearTimeout(timer)
        resolve()
      }
    })

  async function start(label) {
    logs = []
    child = spawn(path.join(serverDir, 'node.exe'), [path.join(serverDir, 'dist', 'main.js')], {
      cwd: serverDir,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.on('data', (d) => logs.push(d.toString()))
    child.stderr.on('data', (d) => logs.push(d.toString()))
    const ready = await waitReady(120000)
    check(`后端启动并就绪（${label}）`, ready, ready ? `端口 ${PORT}` : '120 秒内未就绪')
    if (!ready) {
      console.log('\n--- 后端日志 ---\n' + logs.join('').slice(-4000))
      await stop()
      process.exit(1)
    }
  }

  try {
    console.log('[1/6] 启动打包后的后端（node.exe + dist/main.js，零插件）')
    await start('首次启动')

    console.log('\n[2/6] 静态托管与 SPA')
    const root = await requestRoot()
    check('根路径返回前端页面', root.status === 200 && root.text.includes('<div id="app">'), `status=${root.status}`)

    console.log('\n[3/6] 认证与种子数据（零插件）')
    const login = await request('/auth/login', { method: 'POST', body: { username: 'admin', password: '123456' } })
    const loginToken = login.status === 200 || login.status === 201 ? unwrap(login.json)?.accessToken : null
    check('管理员可登录（种子数据已初始化）', Boolean(loginToken), `status=${login.status}`)

    const plugins0 = loginToken ? await request('/plugins', { token: loginToken }) : { status: 0, json: null }
    check('新客户端插件为空', plugins0.status === 200 && (unwrap(plugins0.json) ?? []).length === 0,
      `已安装 ${(unwrap(plugins0.json) ?? []).length} 个`)

    console.log('\n[4/6] 远程插件市场（唯一插件来源）')
    const status = loginToken ? await request('/market/remote/status', { token: loginToken }) : { status: 0, json: null }
    const statusData = unwrap(status.json)
    check('市场地址已注入后端', status.status === 200 && statusData?.enabled === true, statusData?.url || statusData?.error || '-')
    check('验签公钥已注入后端', statusData?.publicKeysConfigured === true)

    const catalogRes = loginToken ? await request('/market/remote/catalog', { token: loginToken }) : { status: 0, json: null }
    const catalog = unwrap(catalogRes.json)
    check('插件目录可拉取且验签通过', catalogRes.status === 200 && Array.isArray(catalog?.plugins) && catalog.plugins.length > 0,
      `${catalog?.plugins?.length ?? 0} 个插件`)

    console.log('\n[5/6] 从市场安装插件并重启生效')
    for (const id of MARKET_INSTALL) {
      const res = loginToken
        ? await request(`/market/remote/plugins/${id}/install`, { method: 'POST', token: loginToken, body: {} })
        : { status: 0, json: null }
      const installed = unwrap(res.json)?.installed ?? []
      check(`安装 ${id}（含硬依赖）`, res.status === 200 && installed.includes(id), installed.join(', ') || `status=${res.status}`)
    }

    await stop()
    await start('安装插件后')
    const relogin = await request('/auth/login', { method: 'POST', body: { username: 'admin', password: '123456' } })
    const token0 = relogin.status === 200 ? unwrap(relogin.json)?.accessToken : null
    const installedNow = token0 ? unwrap((await request('/plugins', { token: token0 })).json) ?? [] : []
    check('重启后插件已加载', new Set(installedNow.map((p) => p.manifest.id)).size >= MARKET_INSTALL.length,
      installedNow.map((p) => p.manifest.id).join(', '))

    const ctx = token0 ? await ensureCompanyContext(token0) : { token: null, companyId: null }
    const token = ctx.token
    check('记账公司上下文就绪（建账入口可用）', Boolean(ctx.companyId), ctx.companyId ? `companyId=${ctx.companyId}` : '未取到公司')

    const accounts = token ? await request('/accounts/tree', { token }) : { status: 0 }
    const accountTree = unwrap(accounts.json)
    check('会计科目种子已就绪', accounts.status === 200 && Array.isArray(accountTree) && accountTree.length > 0,
      `一级科目 ${Array.isArray(accountTree) ? accountTree.length : '-'} 个`)

    console.log('\n[6/6] 离线 OCR 与票据识别（验证 onnxruntime 与模型裁剪后仍可用）')
    const ocr = token ? await request('/ocr/status', { token }) : { status: 0 }
    const ocrData = unwrap(ocr.json)
    check('OCR 状态就绪', ocr.status === 200 && ocrData?.ready === true,
      `ready=${ocrData?.ready} missing=${JSON.stringify(ocrData?.missing ?? [])}`)

    const receiptsTest = path.join(repoRoot, 'backend', 'test', 'receipts-verify.mjs')
    if (fs.existsSync(receiptsTest)) {
      const result = spawnSync(process.execPath, [receiptsTest, BASE], { encoding: 'utf8' })
      const output = `${result.stdout || ''}${result.stderr || ''}`
      const tail = output.split('\n').filter((l) => /通过|失败|PASS|FAIL|✓|✗/.test(l)).slice(-6).join('\n')
      check('票据上传识别端到端', result.status === 0, tail || `退出码 ${result.status}`)
    } else {
      check('票据上传识别端到端', false, `未找到 ${receiptsTest}`)
    }
  } finally {
    await stop()
    // 子进程刚退出时 SQLite 句柄可能尚未释放，临时目录清理失败不影响验证结论
    try {
      fs.rmSync(dataRoot, { recursive: true, force: true })
    } catch {
      // 忽略：系统临时目录会自行回收
    }
  }

  console.log(`\n结果：${passed} 项通过，${failed} 项失败`)
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error('验证脚本异常:', err)
  process.exit(1)
})
