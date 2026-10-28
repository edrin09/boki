/**
 * 插件生命周期自动化测试（隔离沙箱）
 *
 * 覆盖《插件开发与迁移指南》10.3：
 *   1. 登录管理员
 *   2. 市场目录包含全部插件，初始状态未安装
 *   3. 安装 banks：复制成功、状态 enabled
 *   4. 重启后端：/plugins 显示启用，/banks 可访问
 *   5. 停用 banks：重启后 /banks 404
 *   6. 卸载 banks（保留数据）：目录删除、表保留；重装后数据仍在
 *   7. 卸载 banks（删除数据）：表被删除
 *   8. 安装带依赖的 cash-bank：自动安装 banks
 *   9. 卸载被依赖的 banks：拒绝并提示依赖方
 *  10. 核心记账在零插件状态下全流程通过
 *  11. IAM 插件：管理接口随安装/启停/卸载出现与消失，核心账号数据不随插件删除
 *  12. 多公司插件：公司管理接口随插件启停变化，内核建账入口与账套数据保留
 *
 * 特点：
 * - 自动拉起 / 停止后端，无需提前启动服务；
 * - 使用独立端口、独立 SQLite 与独立插件目录，不污染开发库；
 * - 全程通过 HTTP API 验证，失败时保留沙箱与 server.log 便于排查。
 *
 * 用法：node test/plugins.mjs
 *   PLUGIN_TEST_PORT=3210  指定端口（默认自动选取空闲端口）
 * 前置：cd backend && npm run build
 */
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import * as fs from 'node:fs'
import * as net from 'node:net'
import * as path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const backendRoot = path.resolve(here, '..')
const repoRoot = path.resolve(backendRoot, '..')
const marketplaceRoot = process.env.BOKI_MARKETPLACE_DIR || path.join(repoRoot, 'boki-market')
const outputRoot = path.join(here, 'output')
fs.mkdirSync(outputRoot, { recursive: true })
const sandbox = fs.mkdtempSync(path.join(outputRoot, 'plugin-lifecycle-'))
const pluginsDir = path.join(sandbox, 'plugins')
const dbFile = path.join(sandbox, 'lifecycle.db')
const serverLog = path.join(sandbox, 'server.log')

const require = createRequire(import.meta.url)
const betterSqlite3 = require('better-sqlite3')

const USERNAME = process.env.SMOKE_USERNAME || 'admin'
const PASSWORD = process.env.SMOKE_PASSWORD || '123456'

let passed = 0
let failed = 0
const failures = []

function check(name, ok, extra = '') {
  if (ok) {
    passed += 1
    console.log(`  PASS  ${name}${extra ? '  ' + extra : ''}`)
  } else {
    failed += 1
    failures.push(name)
    console.log(`  FAIL  ${name}${extra ? '  ' + extra : ''}`)
  }
}

function section(title) {
  console.log(`\n${title}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ==================== 后端进程管理 ====================

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
  })
}

const PORT = Number(process.env.PLUGIN_TEST_PORT) || (await freePort())
const BASE = `http://127.0.0.1:${PORT}/api`

const childEnv = {
  ...process.env,
  APP_PORT: String(PORT),
  DB_DATABASE: dbFile,
  BOKI_BACKEND_ROOT: backendRoot,
  BOKI_PLUGINS_DIR: pluginsDir,
  BOKI_MARKETPLACE_DIR: marketplaceRoot,
  INIT_ADMIN_USERNAME: USERNAME,
  INIT_ADMIN_PASSWORD: PASSWORD,
}
// 避免继承外部环境导致建表策略 / 静态托管行为不可控
delete childEnv.DB_SYNCHRONIZE
delete childEnv.WEB_DIST_DIR

let child = null
let exitInfo = null

async function startServer(label) {
  if (child) await stopServer()

  const mainJs = path.join(backendRoot, 'dist', 'main.js')
  if (!fs.existsSync(mainJs)) {
    throw new Error('未找到 dist/main.js，请先执行：cd backend && npm run build')
  }

  exitInfo = null
  const log = fs.createWriteStream(serverLog, { flags: 'a' })
  log.write(`\n===== ${label} @ ${new Date().toISOString()} =====\n`)
  const proc = spawn(process.execPath, ['dist/main.js'], {
    cwd: backendRoot,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child = proc
  proc.stdout.pipe(log)
  proc.stderr.pipe(log)
  proc.once('exit', (code, signal) => {
    exitInfo = { code, signal }
  })

  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (exitInfo) {
      throw new Error(
        `后端启动失败（${label}）：code=${exitInfo.code} signal=${exitInfo.signal}，日志见 ${serverLog}`,
      )
    }
    try {
      const res = await fetch(`${BASE}/plugins/manifests`)
      if (res.status < 500) return
    } catch {
      // 端口尚未监听，继续等待
    }
    await sleep(300)
  }
  throw new Error(`后端启动超时（${label}），日志见 ${serverLog}`)
}

async function stopServer() {
  const proc = child
  if (!proc) return
  child = null
  if (proc.exitCode === null) {
    proc.kill()
    const exited = await Promise.race([
      once(proc, 'exit').then(() => true),
      sleep(8_000).then(() => false),
    ])
    if (!exited) {
      try {
        spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' })
      } catch {
        // 忽略强杀失败，后续端口占用会体现在启动日志里
      }
    }
  }
  // 等 SQLite 释放文件句柄，避免后续做表结构断言时读到旧状态
  await sleep(300)
}

async function restart(label) {
  await startServer(label)
}

// ==================== 沙箱检查工具 ====================

function sandboxPath(...parts) {
  return path.join(pluginsDir, ...parts)
}

function readSandboxState() {
  const file = path.join(pluginsDir, 'state.json')
  if (!fs.existsSync(file)) return { version: 1, plugins: {} }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return { version: 1, plugins: {} }
  }
}

function tableInfo(name) {
  const db = new betterSqlite3(dbFile, { readonly: true, fileMustExist: true })
  try {
    const exists = !!db
      .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(name)
    const count = exists ? db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n : 0
    return { exists, count }
  } finally {
    db.close()
  }
}

function walkFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return []
  const result = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) result.push(...walkFiles(full, base))
    else result.push(path.relative(base, full).replaceAll('\\', '/'))
  }
  return result
}

// ==================== HTTP 工具 ====================

async function api(route, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  return {
    status: res.status,
    code: json?.code,
    message: json?.message,
    data: json && typeof json === 'object' && 'data' in json ? json.data : json,
    json,
  }
}

/** 市场目录中实际存在的插件数量 */
function marketplacePluginIds() {
  const root = path.join(marketplaceRoot, 'plugins')
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(root, d.name, 'manifest.json')))
    .map((d) => d.name)
}

// ==================== 主流程 ====================

let token = ''
const created = { partnerId: null, bankName: null }

async function main() {
  const marketIds = marketplacePluginIds()
  console.log(`== 插件生命周期测试 ==`)
  console.log(`   市场插件 ${marketIds.length} 个：${marketIds.join(', ')}`)
  console.log(`   沙箱：${sandbox}`)
  console.log(`   地址：${BASE}`)

  try {
    // ---------- 1. 零插件基线 ----------
    section('1. 零插件基线（全新库 + 空插件目录）')
    await startServer('zero-plugin')

    const login = await api('/auth/login', {
      method: 'POST',
      body: { username: USERNAME, password: PASSWORD },
    })
    token = login.data?.accessToken
    check('管理员登录成功', login.status === 200 && !!token, `status=${login.status}`)
    if (!token) throw new Error('登录失败，无法继续')

    const catalog = await api('/market/catalog', { token })
    const catalogItems = Array.isArray(catalog.data) ? catalog.data : []
    check(
      '市场目录包含全部插件',
      catalog.status === 200 && catalogItems.length === marketIds.length,
      `${catalogItems.length}/${marketIds.length}`,
    )
    check(
      '所有插件初始为未安装且未启用',
      catalogItems.length > 0 && catalogItems.every((p) => p.installed === false && p.enabled === false),
    )

    const installed0 = await api('/plugins', { token })
    check('已安装插件列表为空', installed0.status === 200 && installed0.data.length === 0, `len=${installed0.data?.length}`)

    const manifests0 = await api('/plugins/manifests', { token })
    check('已启用清单为空', manifests0.status === 200 && manifests0.data.length === 0)

    const zeroBanks = await api('/banks', { token })
    const zeroCashBank = await api('/cash-bank', { token })
    check('未安装时 /banks 不存在', zeroBanks.status === 404, `status=${zeroBanks.status}`)
    check('未安装时 /cash-bank 不存在', zeroCashBank.status === 404, `status=${zeroCashBank.status}`)

    const zeroUsers = await api('/users', { token })
    const zeroRoles = await api('/roles', { token })
    const zeroPermissions = await api('/permissions/tree', { token })
    check('未安装时 /users 不存在（IAM 管理面未加载）', zeroUsers.status === 404, `status=${zeroUsers.status}`)
    check('未安装时 /roles 不存在', zeroRoles.status === 404, `status=${zeroRoles.status}`)
    check('未安装时 /permissions/tree 不存在', zeroPermissions.status === 404, `status=${zeroPermissions.status}`)

    const zeroAsset = await api('/plugin-assets/banks/client/index.js')
    check('未安装时插件静态资产不存在', zeroAsset.status === 404, `status=${zeroAsset.status}`)

    // ---------- 2. 零插件核心记账 ----------
    section('2. 零插件核心记账全流程')
    const companies0 = await api('/companies', { token })
    check(
      '未安装 multi-company 时 /companies 不存在（管理面由插件提供）',
      companies0.status === 404,
      `status=${companies0.status}`,
    )

    const bootstrap = await api('/companies/bootstrap', {
      method: 'POST',
      token,
      body: {
        name: `生命周期测试公司${Date.now().toString().slice(-6)}`,
        taxNo: `91310000LIFECYCLE${Date.now().toString().slice(-6)}`,
        taxpayerType: 'small_scale',
      },
    })
    check(
      '零插件状态可通过内核 /companies/bootstrap 建账套',
      bootstrap.status === 201 && !!bootstrap.data?.id,
      `status=${bootstrap.status} ${bootstrap.message ?? ''}`,
    )
    const companyId = bootstrap.data?.id
    if (!companyId) throw new Error('创建公司失败，无法继续')

    const bootstrapAgain = await api('/companies/bootstrap', {
      method: 'POST',
      token,
      body: { name: '重复建账', taxNo: '91310000DUP', taxpayerType: 'small_scale' },
    })
    check(
      '已有公司时内核建账入口拒绝重复创建',
      bootstrapAgain.status === 400,
      `status=${bootstrapAgain.status}`,
    )

    const switched = await api('/auth/switch-company', {
      method: 'POST',
      token,
      body: { companyId },
    })
    check('切换到新公司并重签令牌', switched.status === 200 && !!switched.data?.accessToken)
    token = switched.data?.accessToken ?? token

    const accounts = await api('/accounts', { token })
    const accountList = Array.isArray(accounts.data) ? accounts.data : []
    const cashAccount = accountList.find((a) => a.code === '1001')
    const revenueAccount = accountList.find((a) => a.code === '6001')
    check('公司科目模板已初始化', accounts.status === 200 && accountList.length >= 70, `len=${accountList.length}`)
    check('存在 1001 / 6001 科目', !!cashAccount && !!revenueAccount)

    const stamp = Date.now().toString().slice(-6)
    const partner = await api('/partners', {
      method: 'POST',
      token,
      body: {
        name: `生命周期客户${stamp}`,
        taxNo: `91310000CUSTOMER${stamp}`,
        type: 'customer',
      },
    })
    check(
      '新增往来单位成功',
      partner.status === 201 && !!partner.data?.id,
      `status=${partner.status} ${partner.message ?? ''}`,
    )
    created.partnerId = partner.data?.id

    const today = new Date().toISOString().slice(0, 10)
    const voucher = await api('/vouchers', {
      method: 'POST',
      token,
      body: {
        word: '记',
        voucherDate: today,
        entries: [
          { summary: '零插件销售收款', accountId: cashAccount?.id, debit: 500 },
          { summary: '零插件销售收款', accountId: revenueAccount?.id, credit: 500, partnerId: created.partnerId },
        ],
        remark: '插件生命周期测试：零插件核心记账',
      },
    })
    check(
      '新增草稿凭证成功',
      voucher.status === 201 && voucher.data?.status === 'draft',
      `status=${voucher.status} ${voucher.message ?? ''}`,
    )
    const voucherId = voucher.data?.id
    const period = voucher.data?.period
    check('凭证借贷平衡', voucher.data?.debitTotal === voucher.data?.creditTotal)

    const approved = await api(`/vouchers/${voucherId}/approve`, { method: 'POST', token })
    check('审核凭证成功', approved.status === 200 && approved.data?.status === 'approved')

    const trial = await api(`/books/trial-balance?endPeriod=${period}`, { token })
    const trialRows = trial.data?.rows ?? []
    check(
      '审核后试算平衡表平衡且含库存现金',
      trial.status === 200 && trial.data?.balanced === true && trialRows.some((r) => r.code === '1001'),
      `balanced=${trial.data?.balanced}`,
    )

    const unapproved = await api(`/vouchers/${voucherId}/unapprove`, { method: 'POST', token })
    check('反审核成功', unapproved.status === 200 && unapproved.data?.status === 'draft')
    const deleted = await api(`/vouchers/${voucherId}`, { method: 'DELETE', token })
    check('删除草稿凭证成功', deleted.status === 200)

    const coreOnlyBanks = await api('/banks', { token })
    check('核心记账全程无插件依赖', coreOnlyBanks.status === 404, `status=${coreOnlyBanks.status}`)

    // ---------- 3. 安装 banks ----------
    section('3. 安装 banks')
    const install = await api('/market/plugins/banks/install', { method: 'POST', token })
    check(
      '安装接口返回成功并要求重启',
      install.status === 200 && install.data?.installed?.includes('banks') && install.data?.restartRequired === true,
      `installed=${install.data?.installed?.join(',') ?? '-'}`,
    )

    const bankDir = sandboxPath('banks')
    const bankFiles = walkFiles(bankDir)
    check(
      '插件目录已复制到安装区',
      bankFiles.includes('manifest.json') && bankFiles.includes('server/index.js') && bankFiles.includes('client/index.js'),
      `${bankFiles.length} 个文件`,
    )
    check(
      '安装区不含 TS / Vue 源码',
      bankFiles.length > 0 && bankFiles.every((f) => !f.endsWith('.ts') && !f.endsWith('.vue')),
    )
    check('安装后生成 .sync-required 标记', fs.existsSync(path.join(pluginsDir, '.sync-required')))

    await restart('install-banks')
    check('重启后同步标记已清理', !fs.existsSync(path.join(pluginsDir, '.sync-required')))

    const installed1 = await api('/plugins', { token })
    const banksEntry = (installed1.data ?? []).find((p) => p.manifest?.id === 'banks')
    check('重启后 /plugins 显示 banks 已启用', !!banksEntry && banksEntry.enabled === true, `enabled=${banksEntry?.enabled}`)

    const manifests1 = await api('/plugins/manifests', { token })
    check(
      '已启用清单包含 banks',
      Array.isArray(manifests1.data) && manifests1.data.some((m) => m.id === 'banks'),
    )

    const banksList = await api('/banks', { token })
    check('重启后 /banks 可访问', banksList.status === 200 && Array.isArray(banksList.data?.list), `status=${banksList.status}`)

    created.bankName = `生命周期现金${stamp}`
    const bank = await api('/banks', {
      method: 'POST',
      token,
      body: { name: created.bankName, type: 'cash', accountCode: '1001' },
    })
    check(
      '新增资金账户成功',
      bank.status === 201 && bank.data?.name === created.bankName,
      `status=${bank.status}`,
    )

    const bankOptions1 = await api('/banks/options?type=cash', { token })
    check(
      '资金账户选项包含刚新增的数据',
      bankOptions1.status === 200 && (bankOptions1.data ?? []).some((b) => b.name === created.bankName),
    )

    const asset = await api('/plugin-assets/banks/client/index.js')
    check('启用后插件静态资产可访问', asset.status === 200 && typeof asset.json === 'string' && asset.json.length > 0, `status=${asset.status}`)

    // ---------- 4. 停用 / 启用 ----------
    section('4. 停用与重新启用 banks')
    const disabled = await api('/plugins/banks/disable', { method: 'POST', token })
    check('停用 banks 成功', disabled.status === 200 && disabled.data?.enabled === false)

    await restart('disable-banks')
    const banksAfterDisable = await api('/banks', { token })
    check('停用重启后 /banks 返回 404', banksAfterDisable.status === 404, `status=${banksAfterDisable.status}`)

    const installedDisabled = await api('/plugins', { token })
    const banksDisabled = (installedDisabled.data ?? []).find((p) => p.manifest?.id === 'banks')
    check('停用后 /plugins 仍可看到插件且 enabled=false', !!banksDisabled && banksDisabled.enabled === false)

    const manifestsDisabled = await api('/plugins/manifests', { token })
    check(
      '停用后已启用清单不含 banks',
      Array.isArray(manifestsDisabled.data) && !manifestsDisabled.data.some((m) => m.id === 'banks'),
    )

    const enabledAgain = await api('/plugins/banks/enable', { method: 'POST', token })
    check('重新启用 banks 成功', enabledAgain.status === 200 && enabledAgain.data?.enabled === true)
    await restart('enable-banks')
    const banksAfterEnable = await api('/banks/options?type=cash', { token })
    check(
      '重新启用后数据仍可读',
      banksAfterEnable.status === 200 && (banksAfterEnable.data ?? []).some((b) => b.name === created.bankName),
    )

    // ---------- 5. 卸载保留数据 ----------
    section('5. 卸载 banks（保留数据）')
    const uninstallKeep = await api('/plugins/banks?keepData=true', { method: 'DELETE', token })
    check('卸载（保留数据）成功', uninstallKeep.status === 200 && uninstallKeep.data?.keepData === true)

    await stopServer()
    check('插件安装目录已删除', !fs.existsSync(bankDir))
    check('state.json 已移除 banks', !readSandboxState().plugins?.banks)
    const keptTable = tableInfo('fin_bank_account')
    check('保留数据：表仍存在且数据保留', keptTable.exists && keptTable.count >= 1, `rows=${keptTable.count}`)

    await restart('uninstall-keep')
    const banksAfterKeep = await api('/banks', { token })
    check('卸载重启后 /banks 返回 404', banksAfterKeep.status === 404, `status=${banksAfterKeep.status}`)

    const reinstallKeep = await api('/market/plugins/banks/install', { method: 'POST', token })
    check('保留数据后重新安装成功', reinstallKeep.status === 200 && reinstallKeep.data?.installed?.includes('banks'))
    await restart('reinstall-banks')
    const bankOptionsKeep = await api('/banks/options?type=cash', { token })
    check(
      '重装后原资金账户数据仍在',
      bankOptionsKeep.status === 200 && (bankOptionsKeep.data ?? []).some((b) => b.name === created.bankName),
    )

    // ---------- 6. 卸载删除数据 ----------
    section('6. 卸载 banks（删除数据）')
    const uninstallDrop = await api('/plugins/banks?keepData=false', { method: 'DELETE', token })
    check('卸载（删除数据）成功', uninstallDrop.status === 200 && uninstallDrop.data?.keepData === false)

    await stopServer()
    check('插件安装目录已删除', !fs.existsSync(bankDir))
    const droppedTable = tableInfo('fin_bank_account')
    check('删除数据：表已被删除', !droppedTable.exists, `exists=${droppedTable.exists}`)

    await restart('uninstall-drop')
    check('删除数据后 /banks 仍为 404', (await api('/banks', { token })).status === 404)

    const reinstallDrop = await api('/market/plugins/banks/install', { method: 'POST', token })
    check('删除数据后重新安装成功', reinstallDrop.status === 200 && reinstallDrop.data?.installed?.includes('banks'))
    await restart('reinstall-after-drop')
    const bankListAfterDrop = await api('/banks', { token })
    check(
      '重装后为空表（旧数据未恢复）',
      bankListAfterDrop.status === 200 && (bankListAfterDrop.data?.list ?? []).length === 0,
      `len=${bankListAfterDrop.data?.list?.length}`,
    )

    // ---------- 7. 依赖解析 ----------
    section('7. 依赖自动安装与卸载保护（cash-bank → banks）')
    // 先移除 banks，确保后续安装能验证「依赖自动安装」
    const clearBanks = await api('/plugins/banks?keepData=true', { method: 'DELETE', token })
    check('依赖测试前移除 banks', clearBanks.status === 200)

    const installCashBank = await api('/market/plugins/cash-bank/install', { method: 'POST', token })
    const installedIds = installCashBank.data?.installed ?? []
    check(
      '安装 cash-bank 自动安装 banks 依赖',
      installCashBank.status === 200 && installedIds.includes('banks') && installedIds.includes('cash-bank'),
      `installed=${installedIds.join(',')}`,
    )
    const stateAfterDep = readSandboxState()
    check(
      '依赖与主插件均写入 enabled 状态',
      stateAfterDep.plugins?.banks?.enabled === true && stateAfterDep.plugins?.['cash-bank']?.enabled === true,
    )

    await restart('install-cash-bank')
    const cashBankApi = await api('/cash-bank', { token })
    check('重启后 /cash-bank 可访问', cashBankApi.status === 200, `status=${cashBankApi.status}`)

    const disableDep = await api('/plugins/banks/disable', { method: 'POST', token })
    check(
      '被依赖时停用 banks 被拒绝',
      disableDep.status === 400 && /cash-bank/.test(disableDep.message ?? ''),
      `status=${disableDep.status} message=${disableDep.message ?? ''}`,
    )

    const uninstallDep = await api('/plugins/banks?keepData=true', { method: 'DELETE', token })
    check(
      '被依赖时卸载 banks 被拒绝',
      uninstallDep.status === 400 && /cash-bank/.test(uninstallDep.message ?? ''),
      `status=${uninstallDep.status} message=${uninstallDep.message ?? ''}`,
    )

    // ---------- 8. 非法输入 ----------
    section('8. 非法插件 ID 与不存在插件')
    const badId = await api('/market/plugins/BANKS/install', { method: 'POST', token })
    check('非法插件 ID 被拒绝', badId.status === 400, `status=${badId.status}`)
    const missing = await api('/market/plugins/not-a-plugin/install', { method: 'POST', token })
    check('安装不存在的插件返回 404', missing.status === 404, `status=${missing.status}`)
    const enableMissing = await api('/plugins/not-a-plugin/enable', { method: 'POST', token })
    check('启用未安装插件返回 404', enableMissing.status === 404, `status=${enableMissing.status}`)

    // ---------- 9. IAM 插件 ----------
    section('9. IAM 插件（用户 / 角色 / 权限管理）')
    const installIam = await api('/market/plugins/iam/install', { method: 'POST', token })
    check(
      '安装 iam 成功并要求重启',
      installIam.status === 200 && installIam.data?.installed?.includes('iam') && installIam.data?.restartRequired === true,
      `installed=${installIam.data?.installed?.join(',') ?? '-'}`,
    )
    await restart('install-iam')

    const iamManifests = await api('/plugins/manifests', { token })
    const iamCtl = (iamManifests.data ?? []).find((m) => m.id === 'iam')
    check(
      '前端清单包含 iam 且声明 global 作用域',
      !!iamCtl && iamCtl.scopeMode === 'global' && iamCtl.contributes?.routes?.length === 3,
      `routes=${iamCtl?.contributes?.routes?.length ?? 0}`,
    )

    const iamUsers = await api('/users', { token })
    check(
      'iam 启用后 /users 可访问且含内置账号',
      iamUsers.status === 200 && (iamUsers.data?.list ?? []).length >= 1,
      `len=${iamUsers.data?.list?.length ?? 0}`,
    )
    const iamRoles = await api('/roles', { token })
    check(
      'iam 启用后 /roles 返回内置角色',
      iamRoles.status === 200 && (iamRoles.data ?? []).length >= 4,
      `len=${iamRoles.data?.length ?? 0}`,
    )
    const iamPermissions = await api('/permissions/tree', { token })
    check(
      'iam 启用后 /permissions/tree 返回权限树',
      iamPermissions.status === 200 && (iamPermissions.data ?? []).length > 0,
    )

    const roleOptions = await api('/roles/options', { token })
    const viewerRole = (roleOptions.data ?? []).find((r) => r.code === 'viewer')
    check('角色下拉包含 viewer', !!viewerRole)

    const iamUsername = `iam_${stamp}`
    const createIamUser = await api('/users', {
      method: 'POST',
      token,
      body: {
        username: iamUsername,
        nickname: 'IAM 测试用户',
        password: '123456',
        roleIds: viewerRole ? [viewerRole.id] : [],
        companyIds: [companyId],
      },
    })
    check(
      '新增用户并授权公司成功',
      createIamUser.status === 201 &&
        (createIamUser.data?.companyIds ?? []).includes(companyId),
      `status=${createIamUser.status} ${createIamUser.message ?? ''}`,
    )

    const viewerLogin = await api('/auth/login', {
      method: 'POST',
      body: { username: iamUsername, password: '123456' },
    })
    const viewerToken = viewerLogin.data?.accessToken
    check(
      '新用户可登录且获得角色权限',
      viewerLogin.status === 200 &&
        !!viewerToken &&
        (viewerLogin.data?.user?.permissions ?? []).includes('voucher:list'),
      `status=${viewerLogin.status}`,
    )
    const viewerUsers = await api('/users', { token: viewerToken })
    check(
      '普通用户无权访问用户管理（403）',
      viewerUsers.status === 403,
      `status=${viewerUsers.status}`,
    )
    const viewerVouchers = await api('/vouchers', { token: viewerToken })
    check(
      '普通用户按角色权限可查询凭证',
      viewerVouchers.status === 200,
      `status=${viewerVouchers.status}`,
    )

    const disableIam = await api('/plugins/iam/disable', { method: 'POST', token })
    check('停用 iam 成功', disableIam.status === 200 && disableIam.data?.enabled === false)
    await restart('disable-iam')
    check('停用后 /users 返回 404', (await api('/users', { token })).status === 404)
    check('停用后 /roles 返回 404', (await api('/roles', { token })).status === 404)
    const adminStillWorks = await api('/vouchers', { token })
    check('停用 iam 后管理员仍可记账（内核不依赖管理面）', adminStillWorks.status === 200)
    const viewerStillWorks = await api('/vouchers', { token: viewerToken })
    check(
      '停用 iam 后普通账号仍可登录（登录/权限判定留内核，v1 边界）',
      viewerStillWorks.status === 200,
      `status=${viewerStillWorks.status}`,
    )

    const enableIam = await api('/plugins/iam/enable', { method: 'POST', token })
    check('重新启用 iam 成功', enableIam.status === 200 && enableIam.data?.enabled === true)
    await restart('enable-iam')
    check('重新启用后 /users 可访问', (await api('/users', { token })).status === 200)

    const uninstallIamKeep = await api('/plugins/iam?keepData=true', { method: 'DELETE', token })
    check('卸载 iam（保留数据）成功', uninstallIamKeep.status === 200 && uninstallIamKeep.data?.keepData === true)
    await stopServer()
    const userTableKept = tableInfo('sys_user')
    const roleTableKept = tableInfo('sys_role')
    check(
      '卸载后核心账号表与数据保留',
      userTableKept.exists && userTableKept.count >= 2 && roleTableKept.exists && roleTableKept.count >= 4,
      `users=${userTableKept.count} roles=${roleTableKept.count}`,
    )
    await restart('uninstall-iam-keep')
    check('卸载后 /users 返回 404', (await api('/users', { token })).status === 404)

    const reinstallIam = await api('/market/plugins/iam/install', { method: 'POST', token })
    check('保留数据后重新安装 iam 成功', reinstallIam.status === 200 && reinstallIam.data?.installed?.includes('iam'))
    await restart('reinstall-iam')
    const usersAfterReinstall = await api('/users?keyword=' + encodeURIComponent(iamUsername), { token })
    check(
      '重装后自建用户仍在',
      usersAfterReinstall.status === 200 &&
        (usersAfterReinstall.data?.list ?? []).some((u) => u.username === iamUsername),
    )

    const uninstallIamDrop = await api('/plugins/iam?keepData=false', { method: 'DELETE', token })
    check('卸载 iam（删除数据）成功', uninstallIamDrop.status === 200 && uninstallIamDrop.data?.keepData === false)
    await stopServer()
    const userTableAfterDrop = tableInfo('sys_user')
    const permissionTableAfterDrop = tableInfo('sys_permission')
    check(
      '删除数据时不会误删内核 sys_* 表',
      userTableAfterDrop.exists &&
        userTableAfterDrop.count >= 2 &&
        permissionTableAfterDrop.exists &&
        permissionTableAfterDrop.count > 0,
      `users=${userTableAfterDrop.count} permissions=${permissionTableAfterDrop.count}`,
    )
    await restart('uninstall-iam-drop')
    check('iam 删除数据后 /users 仍为 404', (await api('/users', { token })).status === 404)
    check('iam 删除数据后核心记账可用', (await api('/vouchers', { token })).status === 200)

    // ---------- 10. 多公司插件 ----------
    section('10. 多公司插件（账套管理）')
    const installMulti = await api('/market/plugins/multi-company/install', { method: 'POST', token })
    const multiInstalled = installMulti.data?.installed ?? []
    check(
      '安装 multi-company 成功并自动安装 iam 依赖',
      installMulti.status === 200 &&
        multiInstalled.includes('multi-company') &&
        multiInstalled.includes('iam'),
      `installed=${multiInstalled.join(',')}`,
    )
    await restart('install-multi-company')

    const multiManifests = await api('/plugins/manifests', { token })
    const multiCtl = (multiManifests.data ?? []).find((m) => m.id === 'multi-company')
    check(
      '前端清单包含 multi-company 且声明 global 作用域 / 2 条路由',
      !!multiCtl &&
        multiCtl.scopeMode === 'global' &&
        multiCtl.contributes?.routes?.length === 2,
      `routes=${multiCtl?.contributes?.routes?.length ?? 0}`,
    )

    const listWithPlugin = await api('/companies', { token })
    check(
      'multi-company 启用后 /companies 可访问',
      listWithPlugin.status === 200 && Array.isArray(listWithPlugin.data),
      `status=${listWithPlugin.status}`,
    )
    check(
      '公司列表包含内核建账入口创建的首个公司',
      (listWithPlugin.data ?? []).some((c) => c.id === companyId),
    )

    const secondName = `插件公司${stamp}`
    const createSecond = await api('/companies', {
      method: 'POST',
      token,
      body: {
        name: secondName,
        taxNo: `91310000PLUGIN${stamp}`,
        taxpayerType: 'small_scale',
        copyAccountsFromCurrent: false,
      },
    })
    check(
      '插件可新建第二家记账公司',
      createSecond.status === 201 && !!createSecond.data?.id,
      `status=${createSecond.status} ${createSecond.message ?? ''}`,
    )
    const secondCompanyId = createSecond.data?.id

    const profileWithTwo = await api('/auth/profile', { token })
    check(
      '新建公司出现在登录公司列表（内核认证读取保留 schema）',
      (profileWithTwo.data?.companies ?? []).some((c) => c.id === secondCompanyId),
    )

    const bootstrapAfterPlugin = await api('/companies/bootstrap', {
      method: 'POST',
      token,
      body: { name: '重复建账', taxNo: '91310000DUP2', taxpayerType: 'small_scale' },
    })
    check(
      '已有公司时内核建账入口继续拒绝（不产生重复账套）',
      bootstrapAfterPlugin.status === 400,
      `status=${bootstrapAfterPlugin.status}`,
    )

    const disableMulti = await api('/plugins/multi-company/disable', { method: 'POST', token })
    check('停用 multi-company 成功', disableMulti.status === 200 && disableMulti.data?.enabled === false)
    await restart('disable-multi-company')
    check('停用后 /companies 返回 404', (await api('/companies', { token })).status === 404)
    const bootstrapDisabled = await api('/companies/bootstrap', {
      method: 'POST',
      token,
      body: { name: '重复建账', taxNo: '91310000DUP3', taxpayerType: 'small_scale' },
    })
    check(
      '停用后内核建账入口仍存在（返回 400 而非 404）',
      bootstrapDisabled.status === 400,
      `status=${bootstrapDisabled.status}`,
    )
    check(
      '停用后既有账套仍可记账（公司上下文留内核）',
      (await api('/vouchers', { token })).status === 200,
    )

    const enableMulti = await api('/plugins/multi-company/enable', { method: 'POST', token })
    check('重新启用 multi-company 成功', enableMulti.status === 200 && enableMulti.data?.enabled === true)
    await restart('enable-multi-company')
    const listAfterEnable = await api('/companies', { token })
    check(
      '重新启用后公司数据仍可读',
      listAfterEnable.status === 200 &&
        (listAfterEnable.data ?? []).some((c) => c.id === secondCompanyId),
    )

    const uninstallMulti = await api('/plugins/multi-company?keepData=false', { method: 'DELETE', token })
    check(
      '卸载 multi-company（删除数据）成功',
      uninstallMulti.status === 200 && uninstallMulti.data?.keepData === false,
    )
    await stopServer()
    const companyTable = tableInfo('sys_company')
    const linkTable = tableInfo('sys_user_company')
    check(
      '卸载（删除数据）不会误删内核账套表',
      companyTable.exists && companyTable.count >= 2 && linkTable.exists && linkTable.count >= 1,
      `companies=${companyTable.count} links=${linkTable.count}`,
    )
    await restart('uninstall-multi-company')
    check('卸载后 /companies 返回 404', (await api('/companies', { token })).status === 404)
    check('卸载后既有账套仍可记账', (await api('/vouchers', { token })).status === 200)

    // ---------- 11. 收尾 ----------
    section('11. 清理沙箱')
    const uninstallCash = await api('/plugins/cash-bank?keepData=true', { method: 'DELETE', token })
    check('卸载 cash-bank 成功', uninstallCash.status === 200)
    const uninstallBanksFinal = await api('/plugins/banks?keepData=true', { method: 'DELETE', token })
    check('随后卸载 banks 成功（无依赖阻塞）', uninstallBanksFinal.status === 200)
  } finally {
    await stopServer()
  }
}

let fatal = null
try {
  await main()
} catch (err) {
  fatal = err
  console.error('\n测试执行异常：', err?.stack || err)
}

console.log(`\n== 结果: ${passed} 通过, ${failed} 失败 ==`)
if (fatal) console.log(`异常：${fatal.message}`)
if (failures.length) {
  console.log('失败用例：')
  failures.forEach((f) => console.log(`  - ${f}`))
}

if (failed === 0 && !fatal) {
  fs.rmSync(sandbox, { recursive: true, force: true })
  console.log('沙箱已清理')
  process.exit(0)
} else {
  console.log(`沙箱保留用于排查：${sandbox}`)
  if (fs.existsSync(serverLog)) console.log(`后端日志：${serverLog}`)
  process.exit(1)
}
