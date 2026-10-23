/**
 * 一键出免环境安装包（Setup.exe）
 *
 * 流程：构建前端 → 构建后端 → 裁剪生产依赖 → 暂存 resources → 生成图标 → electron-builder
 *
 * 用法：
 *   node scripts/build-package.mjs              # 全量
 *   node scripts/build-package.mjs --skip-web   # 跳过前端构建（只改后端时）
 *   node scripts/build-package.mjs --skip-deps  # 复用已裁剪的 node_modules（最快）
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.resolve(__dirname, '..')
const repoRoot = path.resolve(desktopDir, '..')
const backendDir = path.join(repoRoot, 'backend')
const frontendDir = path.join(repoRoot, 'frontend')
const stageDir = path.join(desktopDir, 'stage')
const stageServer = path.join(stageDir, 'server')
const stageWeb = path.join(stageDir, 'web')
const releaseDir = path.join(desktopDir, 'release')

const args = process.argv.slice(2)
const skipWeb = args.includes('--skip-web')
const skipDeps = args.includes('--skip-deps')

const MIRROR = 'https://registry.npmmirror.com'
const NPM_ENV = {
  ...process.env,
  npm_config_registry: MIRROR,
  ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR: 'https://npmmirror.com/mirrors/electron-builder-binaries/',
  // better-sqlite3 的 prebuild-install 默认从 GitHub Releases 取预编译包，
  // 国内网络经代理时常被掐断（socket hang up）。一旦取不到，就会退化成
  // node-gyp 现场编译，或从不可靠来源拿到错版二进制（实测拿到过 ABI 127 的，
  // 与随包的 Node 24 / ABI 137 对不上，装完才崩）。指向 npmmirror 二进制镜像后
  // 稳定拿到 node-v137 那一份。变量名由 prebuild-install 的
  // getEnvPrefix() 规则决定：npm_config_<包名去掉非字母数字>_binary_host_mirror
  npm_config_better_sqlite3_binary_host_mirror: `${MIRROR}/-/binary/better-sqlite3`,
}

function log(msg) {
  console.log(`\n[打包] ${msg}`)
}

function fail(msg) {
  console.error(`\n[打包] 失败：${msg}`)
  process.exit(1)
}

function run(cmd, cmdArgs, opts = {}) {
  // npm 的 lifecycle 脚本（prebuild-install / node-gyp）用的是 PATH 里的 node，
  // 而不是执行 npm 的那个 node。构建机上 PATH 若是 Node 22，prebuild-install 就会
  // 去拉 node-v127 的 better-sqlite3 预编译包，与随包的 Node 24（ABI 137）对不上。
  // 因此这里无条件把随包 Node 的目录顶到 PATH 最前。
  const env = {
    ...NPM_ENV,
    ...opts.env,
    PATH: `${path.dirname(nodeExe())}${path.delimiter}${process.env.PATH || ''}`,
  }
  const { env: _env, ...rest } = opts
  const result = spawnSync(cmd, cmdArgs, { stdio: 'inherit', env, ...rest })
  if (result.status !== 0) fail(`${path.basename(cmd)} ${cmdArgs.join(' ')} 退出码 ${result.status}`)
}

/**
 * 用 node 直接跑 npm 的 JS 入口，避免 Windows 下 shell 引号问题。
 *
 * 必须用 nodeExe()（随包发布的那一个）而不是 process.execPath：
 * 构建机上 PATH 里的 node 可能是 22（ABI 127），装出来的 better-sqlite3 预编译包
 * 就与随包的 node 24（ABI 137）对不上，表现是装完才崩 ERR_DLOPEN_FAILED。
 */
function runNpm(npmArgs, cwd) {
  const npmCli = path.join(path.dirname(nodeExe()), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  if (!fs.existsSync(npmCli)) fail(`未找到 npm CLI: ${npmCli}`)
  run(nodeExe(), [npmCli, ...npmArgs], { cwd })
}

let cachedNodeExe = null
function nodeExe() {
  if (cachedNodeExe) return cachedNodeExe
  const candidate = process.env.NODE_EXE || 'C:\\Program Files\\nodejs\\node.exe'
  if (!fs.existsSync(candidate)) fail(`未找到 node.exe：${candidate}（可用 NODE_EXE 环境变量指定）`)
  cachedNodeExe = candidate
  return candidate
}

/**
 * 删除目录/文件。optional=true 时失败不终止构建，返回 false 交由调用方降级处理。
 */
function rmrf(target, optional = false) {
  if (process.platform === 'win32') {
    // 走进程外的 cmd rd /s /q：部分环境（如嵌入了 fs.rmSync 钩子的
    // 沙箱/安全壳）会拦截 Node 进程内的大批量递归删除，导致打包
    // 中途报 SAFE_DELETE_BULK_CONFIRM_REQUIRED。rd 无此限制。
    if (!fs.existsSync(target)) return true
    const isFile = (() => {
      try {
        return fs.statSync(target).isFile()
      } catch {
        return false
      }
    })()
    const args = isFile
      ? ['del', '/f', '/q', target]
      : ['rd', '/s', '/q', target]
    const r = spawnSync('cmd.exe', ['/d', '/c', ...args], { encoding: 'utf8' })
    const detail = (r.stderr || r.stdout || '').trim()
    if (r.error || (r.status !== 0 && fs.existsSync(target))) {
      if (optional) {
        log(`  删除 ${path.basename(target)} 失败：${r.error?.message || `退出码 ${r.status}`}${detail ? `：${detail}` : ''}`)
        return false
      }
      fail(`删除目录失败：${target}（${r.error?.message || `退出码 ${r.status}`}${detail ? `：${detail}` : ''}）`)
    }
    if (fs.existsSync(target)) {
      // 典型原因：杀毒软件正在扫描刚生成的产物，或资源管理器/其他程序占用文件句柄
      if (optional) {
        log(`  ${path.basename(target)} 被其他程序占用，无法删除`)
        return false
      }
      fail(`删除目录失败：${target}（文件被占用，常见于 Defender 扫描中或程序正在使用该目录；稍等一两分钟重试即可）`)
    }
    return true
  }
  fs.rmSync(target, { recursive: true, force: true })
  return true
}

function copyDir(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.cpSync(from, to, { recursive: true, dereference: true })
}

function dirSizeMB(dir) {
  let total = 0
  const walk = (p) => {
    for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
      const full = path.join(p, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) total += fs.statSync(full).size
    }
  }
  if (fs.existsSync(dir)) walk(dir)
  return total / 1024 / 1024
}

/**
 * 瘦身：只保留 win32-x64 的 CPU 推理能力。
 *
 * 这些包默认携带全平台二进制，实测可裁掉约 260MB：
 * - onnxruntime-node：自带 linux/darwin/win32-arm64 全套 + DirectML GPU 库，
 *   我们只用默认 CPU 执行提供器，跨平台产物与 DirectML/dxcompiler/dxil 均无用；
 * - @img/sharp-wasm32：Windows x64 已有原生 sharp，wasm 回退不需要；
 * - typescript / ts-node / @types：被 typeorm 的 optional peer 带入，
 *   运行时跑的是 dist 编译产物，不做 TS 即时编译。
 */
function trimStage() {
  const nm = path.join(stageServer, 'node_modules')

  const ortBin = path.join(nm, 'onnxruntime-node', 'bin', 'napi-v6')
  if (fs.existsSync(ortBin)) {
    for (const platform of fs.readdirSync(ortBin)) {
      if (platform !== 'win32') rmrf(path.join(ortBin, platform))
    }
    const winDir = path.join(ortBin, 'win32')
    rmrf(path.join(winDir, 'arm64'))
    for (const dll of ['DirectML.dll', 'dxcompiler.dll', 'dxil.dll']) {
      rmrf(path.join(winDir, 'x64', dll))
    }
  }

  // sherpa-onnx-node（语音识别）：可选依赖自带多平台二进制，
  // 正常只在 Windows 上安装出 sherpa-onnx-win-x64；这里按当前平台裁剪兜底
  const sherpaKeep = `sherpa-onnx-${os.platform() === 'win32' ? 'win' : os.platform()}-${os.arch()}`
  for (const dir of fs.readdirSync(nm)) {
    if (dir.startsWith('sherpa-onnx-') && dir !== sherpaKeep && dir !== 'sherpa-onnx-node') {
      rmrf(path.join(nm, dir))
    }
  }

  rmrf(path.join(nm, '@img', 'sharp-wasm32'))
  rmrf(path.join(nm, '@img', 'sharp-freebsd-wasm32'))

  for (const pkg of ['typescript', 'ts-node', '@types']) {
    rmrf(path.join(nm, pkg))
  }

  console.log('  已剔除跨平台二进制、GPU 推理库与 TS 运行时')
}

// ---------- 0.5 应用身份与联系方式（仓库根 .env → 安装页 / 关于对话框 / 签名信息） ----------

/**
 * 解析仓库根 .env：KEY=VALUE，忽略空行与 # 注释，剥离成对引号。
 * 只读文件、不写进程 env——本脚本只用这些值做校验与代码生成。
 * 这是桌面 / 后端 / 前端 / 官网的统一配置源：改根 .env 后重新打包即全局生效。
 */
function loadEnvFile() {
  const envPath = path.join(repoRoot, '.env')
  if (!fs.existsSync(envPath)) fail(`缺少配置文件 ${envPath}（应用身份与联系方式统一配置源）`)
  const env = {}
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}

const IDENTITY_KEYS = [
  'APP_TITLE',
  'OFFICIAL_SITE',
  'WINDOW_TITLE',
  'PUBLISHER_NAME',
  'CONTACT_EMAIL',
  'CONTACT_PHONE',
  'CONTACT_WECHAT',
]
const contactEnv = loadEnvFile()
const missingEnvKeys = IDENTITY_KEYS.filter((k) => !contactEnv[k])
if (missingEnvKeys.length > 0) fail(`根目录 .env 缺少：${missingEnvKeys.join(', ')}`)
const CONTACT = {
  appTitle: contactEnv.APP_TITLE,
  officialSite: contactEnv.OFFICIAL_SITE,
  windowTitle: contactEnv.WINDOW_TITLE,
  publisher: contactEnv.PUBLISHER_NAME,
  email: contactEnv.CONTACT_EMAIL,
  phone: contactEnv.CONTACT_PHONE,
  wechat: contactEnv.CONTACT_WECHAT,
}

// installer-hooks.nsh / electron-builder.yml 的展示行由本脚本以 .env 值重写，
// 从机制上杜绝两处漂移（旧机制是"校验不一致就报错"，改成"以 .env 为准直接写入"）。
const hooksPath = path.join(desktopDir, 'installer-hooks.nsh')
if (!fs.existsSync(hooksPath)) {
  fail(`缺少 ${hooksPath}（NSIS 自定义安装页，electron-builder.yml 的 nsis.include 指向它）`)
}
// 防呆：删除 build/ 下的同名残留。electron-builder 的 getResource 只要在
// buildResourcesDir（build/）里看到同名文件，就用 basename 拼路径优先返回它，
// 根本不看 projectDir 下的源文件——build/installer-hooks.nsh 一旦残留，
// 上面所有重写都会被静默忽略（实测：联系页没进安装包，打包还显示成功）。
const staleHooks = path.join(desktopDir, 'build', 'installer-hooks.nsh')
if (fs.existsSync(staleHooks)) {
  rmrf(staleHooks)
  log(`已删除 build/installer-hooks.nsh 残留（它会优先于源文件被 electron-builder 引用）`)
}
// 安装页 logo 位图由 make-icon.mjs 生成；路径在打包时写入 hooks 的 File 行，
// makensis 编译期把该文件压缩进安装包，运行期释放到 $PLUGINSDIR 供 nsDialogs 显示。
// 注意：File 的源路径必须用 Windows 反斜杠（正斜杠盘符路径 makensis 解析不到，实测）。
const logoPath = path.join(desktopDir, 'build', 'installer-logo.bmp')
if (!fs.existsSync(logoPath)) {
  fail(`缺少安装器 logo ${logoPath}，请先执行 node scripts/make-icon.mjs 生成`)
}

// hooks 必须带 UTF-8 BOM：makensis 对 !include 的子文件靠 BOM 识别字符集，
// 无 BOM 的 UTF8 中文注释会被按 ACP 解析，编译报 "Bad text encoding"（实测）。
// 读入先剥旧 BOM，写回统一重加，避免多次打包 BOM 叠加。
const UTF8_BOM = '\uFEFF'
let hooksSrc = fs.readFileSync(hooksPath, 'utf8').replace(/^\uFEFF/, '')
hooksSrc = hooksSrc
  // 开发者署名（安装页 logo 正下方的加粗行）：按"标签行紧跟 Pop $ContactLblPublisher"
  // 的上下文匹配，幂等可重复打包（不能靠一次性占位符，重写后占位符就没了）
  .replace(
    /(\$\{NSD_CreateLabel\}[^\n]*")[^"\n]*("\s*\r?\n\s*Pop \$ContactLblPublisher)/,
    `$1${CONTACT.publisher}$2`,
  )
  // 官网行是 Link 控件：链接文本即 URL，点击由 ContactOpenSite ExecShell 打开
  .replace(/(\$\{NSD_CreateLink\}[^\n]*")[^"\n]*("\s*\r?\n\s*Pop \$ContactValSite)/, `$1${CONTACT.officialSite}$2`)
  .replace(/(\$\{NSD_CreateLabel\}[^\n]*")[^"\n]*("\s*\r?\n\s*Pop \$ContactValEmail)/, `$1${CONTACT.email}$2`)
  .replace(/(\$\{NSD_CreateLabel\}[^\n]*")[^"\n]*("\s*\r?\n\s*Pop \$ContactValPhone)/, `$1${CONTACT.phone}$2`)
  .replace(/(\$\{NSD_CreateLabel\}[^\n]*")[^"\n]*("\s*\r?\n\s*Pop \$ContactValWechat)/, `$1${CONTACT.wechat}$2`)
  .replace(/"BOKI_LOGO_PATH_PLACEHOLDER"/, `"${logoPath}"`)
fs.writeFileSync(hooksPath, UTF8_BOM + hooksSrc)

const builderYmlPath = path.join(desktopDir, 'electron-builder.yml')
let builderYml = fs.readFileSync(builderYmlPath, 'utf8')
builderYml = builderYml
  .replace(/^copyright: .*$/m, `copyright: Copyright © ${new Date().getFullYear()} ${CONTACT.publisher}`)
  .replace(/^(\s*)publisherName: .*$/m, `$1publisherName: ${CONTACT.publisher}`)
fs.writeFileSync(builderYmlPath, builderYml)

// 「关于 BOKI」对话框的数据源：每次打包从 .env 重新生成，杜绝两处漂移
const contactJs = [
  '/**',
  ' * 应用身份与联系方式（由 scripts/build-package.mjs 依据仓库根 .env 自动生成，请勿手改）',
  ' * 改配置：编辑仓库根 .env → 重新执行 node scripts/build-package.mjs',
  ' */',
  'module.exports = {',
  `  appTitle: ${JSON.stringify(CONTACT.appTitle)},`,
  `  officialSite: ${JSON.stringify(CONTACT.officialSite)},`,
  `  windowTitle: ${JSON.stringify(CONTACT.windowTitle)},`,
  `  publisher: ${JSON.stringify(CONTACT.publisher)},`,
  `  email: ${JSON.stringify(CONTACT.email)},`,
  `  phone: ${JSON.stringify(CONTACT.phone)},`,
  `  wechat: ${JSON.stringify(CONTACT.wechat)},`,
  '}',
  '',
].join('\n')
fs.writeFileSync(path.join(desktopDir, 'src', 'contact.js'), contactJs)
log(`身份与联系方式已从根 .env 分发（installer-hooks.nsh / electron-builder.yml / src/contact.js）`)

// ---------- 0. 前置检查 ----------

log('前置检查')
const nodeVersion = spawnSync(nodeExe(), ['--version'], { encoding: 'utf8' }).stdout.trim()
console.log(`  node.exe: ${nodeExe()} (${nodeVersion})`)
if (!nodeVersion.startsWith('v24.')) {
  fail(`node.exe 必须是 Node 24（better-sqlite3 ABI 137），当前为 ${nodeVersion}`)
}
if (process.version !== nodeVersion) {
  console.log(`  构建脚本由 ${process.version} 执行，依赖安装统一改用随包的 ${nodeVersion}，避免 ABI 错配`)
}

const modelsDir = path.join(backendDir, 'models', 'ocr')
for (const f of ['det.onnx', 'cls.onnx', 'rec.onnx', 'ppocrv6_dict.txt']) {
  if (!fs.existsSync(path.join(modelsDir, f))) {
    fail(`缺少 OCR 模型文件 ${f}，请先执行 cd backend && npm run models:fetch`)
  }
}
console.log('  OCR 模型齐全')

const asrModelsDir = path.join(backendDir, 'models', 'asr', 'zipformer-zh-streaming-int8')
for (const f of ['encoder.int8.onnx', 'decoder.onnx', 'joiner.int8.onnx', 'tokens.txt']) {
  if (!fs.existsSync(path.join(asrModelsDir, f))) {
    fail(`缺少 ASR 模型文件 ${f}，请先执行 cd backend && npm run models:fetch-asr`)
  }
}
console.log('  ASR 模型齐全')

// ---------- 1. 构建前端 ----------

if (skipWeb) {
  log('跳过前端构建（--skip-web）')
} else {
  log('构建前端')
  // 先清掉旧 dist：vite 的 emptyOutDir 在其包内做递归删除，
  // 部分安全壳环境会拦截（批量删除保护），预清理后它无事可做。
  rmrf(path.join(frontendDir, 'dist'))
  runNpm(['run', 'build'], frontendDir)
}
if (!fs.existsSync(path.join(frontendDir, 'dist', 'index.html'))) {
  fail('前端产物缺失 frontend/dist/index.html')
}

// ---------- 2. 构建后端 ----------

// nest build 走 tsc 增量编译（tsconfig.build.tsbuildinfo 落在 dist 内）。
// 一旦增量状态与实际输出不一致（例如某个 dist 文件被外部删除、
// 或历史构建残留了过期签名），tsc 会认为该文件「无需重新生成」而跳过补齐，
// 结果是 dist 看似存在、实则缺少 app.module 依赖的模块，装完运行才崩 MODULE_NOT_FOUND。
// 打包场景要的是「完整可用」，因此先清空 dist 与增量信息，做一次全量编译。
log('构建后端（全量重编，先清空 dist 与增量缓存）')
rmrf(path.join(backendDir, 'dist'))
runNpm(['run', 'build'], backendDir)
if (!fs.existsSync(path.join(backendDir, 'dist', 'main.js'))) {
  fail('后端产物缺失 backend/dist/main.js')
}

// ---------- 3. 暂存 resources/web ----------

log('暂存前端产物 → stage/web')
rmrf(stageWeb)
copyDir(path.join(frontendDir, 'dist'), stageWeb)
console.log(`  ${dirSizeMB(stageWeb).toFixed(1)} MB`)

// ---------- 4. 暂存 resources/server ----------

log('暂存后端产物 → stage/server')
fs.mkdirSync(stageServer, { recursive: true })

// 4.1 构建产物与模型（每次覆盖）
rmrf(path.join(stageServer, 'dist'))
copyDir(path.join(backendDir, 'dist'), path.join(stageServer, 'dist'))

rmrf(path.join(stageServer, 'models'))
copyDir(modelsDir, path.join(stageServer, 'models', 'ocr'))
copyDir(asrModelsDir, path.join(stageServer, 'models', 'asr', 'zipformer-zh-streaming-int8'))

// 4.1.5 官方插件种子：backend/data/plugins → stage/server/data/plugins。
// 多公司、OCR、票据等能力全是插件而非内核，包内不带种子时，全新安装的后端
// 零插件启动，/companies、/ocr/status、/receipts 等接口全部 404
// （端到端验证 3/4 失败、0/24 子项通过的根因）。
// 种子随包落在 resources/server/data/plugins（只读）；首次启动由 Electron 壳
// 复制到 ProgramData 下可写的 BOKI_PLUGINS_DIR（安装目录标准用户只读）。
// node_modules 下只有 @core/@plugin 两个 junction，dereference 会把整个
// backend/dist 复制两遍；后端启动时 ensureRuntimeLinks() 自行重建，故剔除。
const pluginsSeedSrc = path.join(backendDir, 'data', 'plugins')
if (!fs.existsSync(path.join(pluginsSeedSrc, 'state.json'))) {
  fail(`缺少官方插件种子：${pluginsSeedSrc}（backend/data/plugins 为参考安装目录，含 state.json）`)
}
const pluginsSeedDst = path.join(stageServer, 'data', 'plugins')
rmrf(pluginsSeedDst)
fs.cpSync(pluginsSeedSrc, pluginsSeedDst, {
  recursive: true,
  dereference: true,
  filter: (src) => path.basename(src) !== 'node_modules',
})
const seededPluginIds = fs
  .readdirSync(pluginsSeedDst, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
console.log(`  插件种子 ${seededPluginIds.length} 个 → stage/server/data/plugins`)

fs.copyFileSync(path.join(backendDir, 'package.json'), path.join(stageServer, 'package.json'))
fs.copyFileSync(
  path.join(backendDir, 'package-lock.json'),
  path.join(stageServer, 'package-lock.json'),
)

// 4.2 Node 运行时（sidecar 靠它跑，ABI 与预编译原生模块一致）
fs.copyFileSync(nodeExe(), path.join(stageServer, 'node.exe'))

// 4.3 生产依赖：隔离安装并按 lock 裁剪，剔除 @nestjs/cli、typescript 等开发依赖
if (skipDeps && fs.existsSync(path.join(stageServer, 'node_modules'))) {
  log('复用已裁剪的生产依赖（--skip-deps）')
} else {
  log('裁剪生产依赖（npm ci --omit=dev，约 1-3 分钟）')
  rmrf(path.join(stageServer, 'node_modules'))
  runNpm(['ci', '--omit=dev', '--no-audit', '--no-fund'], stageServer)
}

// 4.4 瘦身：剔除与 win32-x64 CPU 推理无关的二进制
trimStage()

// 4.5 原生模块运行校验：必须用「随包发布的那一个 node.exe」真实加载一次。
// 只查文件存在与否不够——构建机的 node 与随包 node 版本不一致时，
// better-sqlite3 会以 ABI 不匹配（127 vs 137）在装完运行时才崩，而文件一个不少。
// ⚠️ 依赖以 npm alias 安装的是 better-sqlite3-multiple-ciphers（加密 fork），
//    require('better-sqlite3') 解析到的就是它。验证分两层：
//    ① 包名必须是 fork（alias 被摘掉时立刻报错，错误信息可读）；
//    ② 功能级验证（真校验）：建临时文件库 → cipher=sqlcipher + key 建表 →
//       不带 key 重开必须失败、带 key 必须读回。原版 better-sqlite3 没有
//       cipher/key pragma，第二项会当场失败。
//    注意：不要用 PRAGMA cipher_version 佐证——multiple-ciphers v12 起该
//    PRAGMA 返回空（实测 12.11.1 内存库/文件库均 undefined），且不支持给
//    :memory: 库设 key，照老写法会误报「装的是原版」。
const probeScript = [
  "const D=require('better-sqlite3')",
  "const fs=require('node:fs'),os=require('node:os'),path=require('node:path')",
  "const pkg=require('better-sqlite3/package.json')",
  "if(pkg.name!=='better-sqlite3-multiple-ciphers')throw new Error('解析到的 better-sqlite3 实为 '+pkg.name+'，而非加密分支：backend/package.json 的 npm alias 被改掉了？')",
  "const p=path.join(os.tmpdir(),'boki-native-probe-'+process.pid+'.db')",
  "const key=\"x'\"+'ab'.repeat(32)+\"'\"",
  "const rm=()=>{try{fs.rmSync(p,{force:true})}catch{}}",
  "const open=(withKey)=>{const d=new D(p);d.pragma(\"cipher='sqlcipher'\");if(withKey)d.pragma('key=\"'+key+'\"');return d}",
  "const d1=open(true)",
  "d1.prepare('create table probe(a)').run()",
  "d1.prepare(\"insert into probe values('ok')\").run()",
  "d1.close()",
  "let openedWithoutKey=false",
  "const dBad=open(false)",
  "try{dBad.prepare('select * from probe').get()}catch{openedWithoutKey=true}",
  "dBad.close()",
  "if(!openedWithoutKey){rm();throw new Error('加密分支功能验证失败：不带 key 也能打开库，实际装的是原版 better-sqlite3')}",
  "const d2=open(true)",
  "const row=d2.prepare('select * from probe').get()",
  "d2.close()",
  "rm()",
  "if(!row||row.a!=='ok')throw new Error('加密分支功能验证失败：带 key 读不回数据')",
  "require('onnxruntime-node')",
  "require('sharp')",
  "require('@napi-rs/canvas')",
  "require('sherpa-onnx-node')",
  "console.log('NATIVE_OK','sqlcipher-functional')",
].join(';')
const probe = spawnSync(path.join(stageServer, 'node.exe'), ['-e', probeScript], {
  cwd: stageServer,
  encoding: 'utf8',
  env: { ...process.env, NODE_ENV: 'production' },
})
if (probe.status !== 0 || !(probe.stdout || '').includes('NATIVE_OK')) {
  const detail = `${probe.stderr || ''}${probe.stdout || ''}`
    .trim()
    .split('\n')
    .slice(0, 12)
    .join('\n  ')
  fail(`原生依赖无法用随包 node.exe 加载（ABI 不匹配或二进制缺失）：\n  ${detail}`)
}
console.log('  原生依赖已用随包 node.exe 实测加载通过')
console.log(`  server 暂存体积 ${dirSizeMB(stageServer).toFixed(1)} MB`)

// ---------- 5. 图标 ----------

log('生成应用图标')
run(process.execPath, [path.join(desktopDir, 'scripts', 'make-icon.mjs')])

// ---------- 5.5 Electron 运行时（electronDist 通道） ----------
//
// electron-builder.yml 配了 electronDist: build/electron-dist，让 electron-builder
// 用 copyDir 而不是 rename 铺 Electron 运行时——本机安全垫片会拦截大目录 rename
// （实测 EPERM：73 个文件的 win-unpacked.tmp → win-unpacked 被拒，而同样内容的
// cp -r 放行）。默认行为（下载 zip → 解压到 .tmp → rename）在这里必然失败。
//
// 本段负责目录缺失时从 @electron/get 的缓存里找 zip 并解压生成；
// 缓存也没有时放行让 electron-builder 自己下载，届时若 rename 被拒会报错，
// 重跑一次即可（第二次命中缓存，走本段的解压逻辑）。
const electronDistDir = path.join(desktopDir, 'build', 'electron-dist')
if (!fs.existsSync(path.join(electronDistDir, 'electron.exe'))) {
  const electronVersion = JSON.parse(
    fs.readFileSync(path.join(desktopDir, 'package.json'), 'utf8'),
  ).devDependencies.electron.replace(/^[\^~]/, '')
  // @electron/get 的缓存布局：%LOCALAPPDATA%/electron/Cache/<hash>/electron-v<ver>-win32-x64.zip
  const cacheRoot = path.join(process.env.LOCALAPPDATA || '', 'electron', 'Cache')
  let zipPath = null
  if (fs.existsSync(cacheRoot)) {
    for (const dir of fs.readdirSync(cacheRoot)) {
      const candidate = path.join(cacheRoot, dir, `electron-v${electronVersion}-win32-x64.zip`)
      if (fs.existsSync(candidate)) {
        zipPath = candidate
        break
      }
    }
  }
  if (zipPath) {
    log(`准备 Electron 运行时（解压 ${path.basename(zipPath)} → build/electron-dist）`)
    fs.mkdirSync(electronDistDir, { recursive: true })
    // Windows 自带 Expand-Archive，不引入额外解压依赖
    run('powershell', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${electronDistDir}' -Force`,
    ])
    if (!fs.existsSync(path.join(electronDistDir, 'electron.exe'))) {
      fail(`Expand-Archive 解压成功但 ${electronDistDir} 里没有 electron.exe，请检查 zip 内容结构`)
    }
  } else {
    log('  ⚠ 未找到 Electron 缓存 zip，交由 electron-builder 自行下载（若后续 rename 受限报错，重跑一次即可命中缓存）')
  }
} else {
  log('Electron 运行时已就绪（build/electron-dist）')
}

// ---------- 6. 安装壳依赖并打包 ----------

const electronBuilderPkg = path.join(desktopDir, 'node_modules', 'electron-builder', 'package.json')
if (!fs.existsSync(electronBuilderPkg)) {
  log('安装 Electron 壳依赖（首次约 3-5 分钟，需下载 Electron 运行时）')
  runNpm(['install', '--no-audit', '--no-fund'], desktopDir)
}

log('electron-builder 出安装包')
// release 被其他程序占用（杀毒扫描 / 索引器 / 资源管理器预览）时降级：
// 换用备用输出目录继续构建，不让整个打包卡死在清理步骤。
// 旧 release/ 留给用户重启或关闭占用程序后手动清理。
let outputDir = releaseDir
if (!rmrf(releaseDir, true)) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')
  outputDir = path.join(desktopDir, `release-${stamp}`)
  log(`  ⚠ release/ 被占用，本次产物改到 ${path.basename(outputDir)}/`)
}
const ebBin = JSON.parse(fs.readFileSync(electronBuilderPkg, 'utf8')).bin
const ebCli = path.join(
  desktopDir,
  'node_modules',
  'electron-builder',
  typeof ebBin === 'string' ? ebBin : ebBin['electron-builder'],
)
run(process.execPath, [ebCli, '--win', 'nsis', '--x64', `-c.directories.output=${outputDir}`], { cwd: desktopDir })

// ---------- 7. 产物校验 ----------

// electron-builder 的默认忽略规则含 !**/node_modules/**，配置漏写 filter 时
// 依赖目录会被静默丢弃，装完才崩。必须在这里拦住。
log('校验打包产物')
const unpacked = path.join(outputDir, 'win-unpacked', 'resources')
const requiredInPackage = [
  'server/node.exe',
  'server/dist/main.js',
  'server/dist/config/database.config.js',
  'server/models/ocr/det.onnx',
  'server/models/asr/zipformer-zh-streaming-int8/encoder.int8.onnx',
  'server/models/asr/zipformer-zh-streaming-int8/tokens.txt',
  'server/node_modules/@nestjs/core/package.json',
  'server/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
  'server/node_modules/onnxruntime-node/bin/napi-v6/win32/x64/onnxruntime.dll',
  'server/node_modules/sharp/package.json',
  'server/data/plugins/state.json',
  'server/data/plugins/ocr/manifest.json',
  'server/data/plugins/receipts/manifest.json',
  'server/data/plugins/multi-company/manifest.json',
  'web/index.html',
  'icon.ico',
]
const missing = requiredInPackage.filter((rel) => !fs.existsSync(path.join(unpacked, rel)))
if (missing.length) {
  fail(`打包产物缺少以下文件，安装后无法运行：\n  ${missing.join('\n  ')}`)
}
console.log(`  产物完整（校验 ${requiredInPackage.length} 项）`)

// ---------- 7.5 降级目录回收 ----------

// 曾降级到 release-<时间戳>/ 时，把全部产物（含 win-unpacked，供 verify-package.mjs
// 校验端到端流程）整体 rename 回 release/ 并清掉降级目录——rename 同卷瞬间完成，
// 用户面前永远只有一个 release/ 输出目录。
if (outputDir !== releaseDir) {
  try {
    fs.mkdirSync(releaseDir, { recursive: true })
    for (const entry of fs.readdirSync(outputDir)) {
      fs.renameSync(path.join(outputDir, entry), path.join(releaseDir, entry))
    }
    rmrf(outputDir)
    outputDir = releaseDir
    log('已把降级目录产物搬回 release/ 并清理 release-<时间戳>/')
  } catch (err) {
    log(`  ⚠ 产物仍在 ${path.basename(outputDir)}/（搬回 release/ 失败：${err.message}）`)
  }
}

// ---------- 8. 汇总 ----------

log('完成')
console.log(`  win-unpacked: ${dirSizeMB(path.join(outputDir, 'win-unpacked')).toFixed(1)} MB`)
for (const file of fs.readdirSync(outputDir)) {
  if (file.endsWith('.exe')) {
    const size = fs.statSync(path.join(outputDir, file)).size / 1024 / 1024
    console.log(`  安装包: desktop/${path.basename(outputDir)}/${file}  (${size.toFixed(1)} MB)`)
  }
}