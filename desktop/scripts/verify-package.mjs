/**
 * 打包产物端到端验证
 *
 * 直接以打包后的 node.exe + dist 启动后端（与 Electron 壳的拉起方式一致），
 * 在临时数据目录上复刻全新安装（含随包插件种子铺载），跑通
 * 「静态托管 → 登录 → OCR 就绪 → 票据上传识别」链路。
 *
 * 这一步能拦住「装完才崩」的问题：原生模块缺失、模型未打进包、
 * 前端产物漏拷、JWT/环境变量注入不对。
 *
 * 用法：node scripts/verify-package.mjs
 */
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.resolve(__dirname, '..')
const repoRoot = path.resolve(desktopDir, '..')

// 默认验证 desktop/release；build-package.mjs 在 release/ 被占用时会降级到
// release-<时间戳>/，用 RELEASE_DIR 显式指向本次产物，避免验证错验旧包。
const releaseDir = process.env.RELEASE_DIR
  ? path.resolve(desktopDir, process.env.RELEASE_DIR)
  : path.join(desktopDir, 'release')
const resources = path.join(releaseDir, 'win-unpacked', 'resources')
const serverDir = path.join(resources, 'server')
const PORT = Number(process.env.VERIFY_PORT || 19300)
const BASE = `http://127.0.0.1:${PORT}/api`

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
 * 已有公司则直接切换。保证脚本在空库与存量库上都能跑通、且可重复运行。
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
    console.error(`未找到打包产物：${serverDir}\n请先执行 npm run pack（产物被占用时会降级到 release-<时间戳>/，用 RELEASE_DIR 指定）`)
    process.exit(1)
  }

  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-verify-'))
  console.log(`临时数据目录: ${dataRoot}`)
  console.log(`验证端口: ${PORT}\n`)

  // 模拟全新安装：Electron 壳首次启动会把随包插件种子
  // （resources/server/data/plugins）铺到 ProgramData 下的 BOKI_PLUGINS_DIR。
  // 这里在临时数据目录复刻同一布局，确保验证走的是真实 provision 路径，
  // 而不是绕过插件直接起后端（那正是历史上 0/24 失败的盲区）。
  const pluginsDir = path.join(dataRoot, 'plugins')
  const pluginsSeed = path.join(serverDir, 'data', 'plugins')
  if (!fs.existsSync(path.join(pluginsSeed, 'state.json'))) {
    console.error(`未找到随包插件种子：${pluginsSeed}\n打包产物不完整，请重新执行 npm run pack`)
    process.exit(1)
  }
  fs.cpSync(pluginsSeed, pluginsDir, { recursive: true })
  console.log(`插件种子已铺载: ${pluginsDir}\n`)

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
    // 与 desktop/src/server.js buildEnv 保持一致：可写插件目录 + 依赖解析链
    BOKI_PLUGINS_DIR: pluginsDir,
    NODE_PATH: path.join(serverDir, 'node_modules'),
  }

  console.log('[1/5] 启动打包后的后端（node.exe + dist/main.js）')
  const child = spawn(path.join(serverDir, 'node.exe'), [path.join(serverDir, 'dist', 'main.js')], {
    cwd: serverDir,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const logs = []
  child.stdout.on('data', (d) => logs.push(d.toString()))
  child.stderr.on('data', (d) => logs.push(d.toString()))

  const stop = () =>
    new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve()
      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          // 已退出
        }
        resolve()
      }, 5000)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      try {
        child.kill()
      } catch {
        clearTimeout(timer)
        resolve()
      }
    })

  try {
    const ready = await waitReady(120000)
    check('后端启动并就绪', ready, ready ? `端口 ${PORT}` : '120 秒内未就绪')
    if (!ready) {
      console.log('\n--- 后端日志 ---\n' + logs.join('').slice(-4000))
      await stop()
      process.exit(1)
    }

    console.log('\n[2/5] 静态托管与 SPA')
    const root = await requestRoot()
    check('根路径返回前端页面', root.status === 200 && root.text.includes('<div id="app">'), `status=${root.status}`)

    console.log('\n[3/5] 认证与种子数据')
    const login = await request('/auth/login', { method: 'POST', body: { username: 'admin', password: '123456' } })
    const loginToken = login.status === 200 || login.status === 201 ? unwrap(login.json)?.accessToken : null
    check('管理员可登录（种子数据已初始化）', Boolean(loginToken), `status=${login.status}`)

    // 空库首启没有记账公司：按前端引导建一家并切换到公司上下文，业务接口才能用
    const ctx = loginToken ? await ensureCompanyContext(loginToken) : { token: null, companyId: null }
    const token = ctx.token
    check('记账公司上下文就绪（首启自动建账）', Boolean(ctx.companyId), ctx.companyId ? `companyId=${ctx.companyId}` : '未取到公司')

    const accounts = token ? await request('/accounts/tree', { token }) : { status: 0 }
    const accountTree = unwrap(accounts.json)
    check('会计科目种子已就绪', accounts.status === 200 && Array.isArray(accountTree) && accountTree.length > 0,
      `一级科目 ${Array.isArray(accountTree) ? accountTree.length : '-'} 个`)

    console.log('\n[4/5] 离线 OCR 引擎（验证 onnxruntime 与模型裁剪后仍可用）')
    const ocr = token ? await request('/ocr/status', { token }) : { status: 0 }
    const ocrData = unwrap(ocr.json)
    check('OCR 状态就绪', ocr.status === 200 && ocrData?.ready === true,
      `ready=${ocrData?.ready} missing=${JSON.stringify(ocrData?.missing ?? [])}`)

    console.log('\n[5/5] 票据上传 → 识别 → 解析（真实推理链路）')
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