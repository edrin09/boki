/**
 * WebView2 轻壳构建：下载/缓存 WebView2 SDK → 生成 Brand/AssemblyInfo → csc 编译 → 暂存安装目录。
 *
 * 壳本体只有几百 KB（managed DLL + Loader），浏览器内核用系统自带 WebView2 运行时。
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const WEBVIEW2_VERSION = '1.0.4314.35'
const WEBVIEW2_NUPKG = `https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/${WEBVIEW2_VERSION}/microsoft.web.webview2.${WEBVIEW2_VERSION}.nupkg`
const WEBVIEW2_BOOTSTRAPPER = 'https://go.microsoft.com/fwlink/p/?LinkId=2124703'
// NSIS 3.0.4.1（含 nsDialogs / MUI2，约 1.2 MB），取自 npmmirror 二进制镜像
const NSIS_URL =
  'https://registry.npmmirror.com/-/binary/electron-builder-binaries/nsis-3.0.4.1/nsis-3.0.4.1.7z'
const UTF8_BOM = '\uFEFF'

function csString(value) {
  return `"${String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')}"`
}

function runPowerShell(script) {
  return spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
  })
}

function download(url, dest, log, fail) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const script =
    `$ProgressPreference='SilentlyContinue'; ` +
    `Invoke-WebRequest -Uri '${url}' -OutFile '${dest}' -UseBasicParsing -TimeoutSec 180`
  const result = runPowerShell(script)
  if (result.status !== 0 || !fs.existsSync(dest)) {
    fail(`下载失败：${url}\n  ${(result.stderr || '').trim().split('\n').slice(0, 6).join('\n  ')}`)
  }
  log(`  已下载 ${path.basename(dest)}（${(fs.statSync(dest).size / 1024 / 1024).toFixed(1)} MB）`)
}

/** 下载并缓存 WebView2 SDK，返回所需 DLL 路径 */
export function ensureWebView2Sdk(desktopDir, log, fail) {
  const cacheDir = path.join(desktopDir, '.cache', 'webview2', WEBVIEW2_VERSION)
  const coreDll = path.join(cacheDir, 'Microsoft.Web.WebView2.Core.dll')
  const winformsDll = path.join(cacheDir, 'Microsoft.Web.WebView2.WinForms.dll')
  const loaderDll = path.join(cacheDir, 'WebView2Loader.dll')

  if (fs.existsSync(coreDll) && fs.existsSync(winformsDll) && fs.existsSync(loaderDll)) {
    log(`复用 WebView2 SDK 缓存（${WEBVIEW2_VERSION}）`)
    return { coreDll, winformsDll, loaderDll }
  }

  log(`准备 WebView2 SDK（${WEBVIEW2_VERSION}）`)
  const nupkg = path.join(cacheDir, 'webview2.nupkg')
  const zip = path.join(cacheDir, 'webview2.zip')
  const extractDir = path.join(cacheDir, 'extract')
  download(WEBVIEW2_NUPKG, nupkg, log, fail)
  fs.copyFileSync(nupkg, zip)
  const unpack = runPowerShell(
    `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${extractDir}' -Force`,
  )
  if (unpack.status !== 0) {
    fail(`解包 WebView2 SDK 失败：${(unpack.stderr || '').trim()}`)
  }

  const lib = path.join(extractDir, 'lib', 'net462')
  fs.copyFileSync(path.join(lib, 'Microsoft.Web.WebView2.Core.dll'), coreDll)
  fs.copyFileSync(path.join(lib, 'Microsoft.Web.WebView2.WinForms.dll'), winformsDll)
  fs.copyFileSync(
    path.join(extractDir, 'runtimes', 'win-x64', 'native', 'WebView2Loader.dll'),
    loaderDll,
  )
  return { coreDll, winformsDll, loaderDll }
}

function writeUtf8Bom(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, UTF8_BOM + text.replace(/\r?\n/g, '\r\n'))
}

/** 生成 Brand.g.cs（应用身份与联系方式，来源是仓库根 .env） */
export function generateBrand(desktopDir, brand) {
  const generatedDir = path.join(desktopDir, 'shell', 'generated')
  fs.mkdirSync(generatedDir, { recursive: true })
  const lines = [
    '/**',
    ' * 应用身份与联系方式（由 scripts/build-shell.mjs 依据仓库根 .env 自动生成，请勿手改）',
    ' */',
    'namespace BokiShell',
    '{',
    '    internal static class Brand',
    '    {',
    `        public const string AppTitle = ${csString(brand.appTitle)};`,
    `        public const string WindowTitle = ${csString(brand.windowTitle)};`,
    `        public const string OfficialSite = ${csString(brand.officialSite)};`,
    `        public const string Publisher = ${csString(brand.publisher)};`,
    `        public const string Email = ${csString(brand.email)};`,
    `        public const string Phone = ${csString(brand.phone)};`,
    `        public const string Wechat = ${csString(brand.wechat)};`,
    `        public const string Version = ${csString(brand.version)};`,
    `        public const string MarketUrl = ${csString(brand.marketUrl)};`,
    `        public const string MarketPublicKeys = ${csString(brand.marketPublicKeys)};`,
    '    }',
    '}',
    '',
  ]
  fs.writeFileSync(path.join(generatedDir, 'Brand.g.cs'), lines.join('\n'))

  const version4 = `${brand.version}.0`.split('.').slice(0, 4).join('.')
  const assembly = [
    'using System.Reflection;',
    `[assembly: AssemblyTitle(${csString(brand.appTitle)})]`,
    `[assembly: AssemblyDescription(${csString(brand.appTitle + ' 桌面轻壳')})]`,
    `[assembly: AssemblyCompany(${csString(brand.publisher)})]`,
    `[assembly: AssemblyProduct(${csString(brand.appTitle)})]`,
    `[assembly: AssemblyCopyright(${csString('Copyright © ' + brand.publisher)})]`,
    `[assembly: AssemblyVersion(${csString(version4)})]`,
    `[assembly: AssemblyFileVersion(${csString(version4)})]`,
    `[assembly: AssemblyInformationalVersion(${csString(brand.version)})]`,
    '',
  ]
  fs.writeFileSync(path.join(generatedDir, 'AssemblyInfo.g.cs'), assembly.join('\n'))
}

function findCsc(fail) {
  const candidates = [
    path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  fail('未找到 .NET Framework 编译器 csc.exe（Framework64\\v4.0.30319）')
}

function listCsFiles(dir) {
  const result = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) result.push(...listCsFiles(full))
    else if (entry.name.endsWith('.cs')) result.push(full)
  }
  return result
}

/** csc 编译轻壳到 outDir（BOKI.exe + WebView2 DLL + icon.ico） */
export function compileShell(desktopDir, outDir, sdk, log, fail) {
  log('编译 WebView2 轻壳（csc）')
  fs.mkdirSync(outDir, { recursive: true })

  const shellDir = path.join(desktopDir, 'shell')
  const sources = listCsFiles(shellDir)
  const csc = findCsc(fail)
  const exe = path.join(outDir, 'BOKI.exe')

  const args = [
    '/nologo',
    '/target:winexe',
    '/platform:x64',
    '/optimize+',
    '/debug-',
    `/out:${exe}`,
    `/win32icon:${path.join(desktopDir, 'build', 'icon.ico')}`,
    `/win32manifest:${path.join(shellDir, 'app.manifest')}`,
    '/r:System.dll',
    '/r:System.Core.dll',
    '/r:System.Drawing.dll',
    '/r:System.Windows.Forms.dll',
    `/r:${sdk.coreDll}`,
    `/r:${sdk.winformsDll}`,
    ...sources,
  ]
  const result = spawnSync(csc, args, { encoding: 'utf8' })
  if (result.status !== 0) {
    fail(`轻壳编译失败：\n${(result.stdout || result.stderr || '').trim()}`)
  }

  fs.copyFileSync(sdk.coreDll, path.join(outDir, 'Microsoft.Web.WebView2.Core.dll'))
  fs.copyFileSync(sdk.winformsDll, path.join(outDir, 'Microsoft.Web.WebView2.WinForms.dll'))
  fs.copyFileSync(sdk.loaderDll, path.join(outDir, 'WebView2Loader.dll'))
  fs.copyFileSync(path.join(desktopDir, 'build', 'icon.ico'), path.join(outDir, 'icon.ico'))

  log(`  轻壳产物 BOKI.exe（${(fs.statSync(exe).size / 1024).toFixed(0)} KB）`)
}

/**
 * 组装安装目录：轻壳 + resources\server + resources\web + WebView2 在线安装器（可选）。
 * WebView2 安装器下载失败不阻断打包：目标机绝大多数已随 Edge 安装运行时。
 */
export function stageShell(desktopDir, outDir, stageServer, stageWeb, log, fail) {
  const sdkDir = path.join(desktopDir, '.cache', 'webview2', WEBVIEW2_VERSION)
  fs.mkdirSync(outDir, { recursive: true })

  const copyDir = (from, to) => {
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.cpSync(from, to, { recursive: true, dereference: true })
  }
  copyDir(stageServer, path.join(outDir, 'resources', 'server'))
  copyDir(stageWeb, path.join(outDir, 'resources', 'web'))

  const bootstrapper = path.join(sdkDir, 'MicrosoftEdgeWebview2Setup.exe')
  if (!fs.existsSync(bootstrapper)) {
    try {
      download(WEBVIEW2_BOOTSTRAPPER, bootstrapper, log, fail)
    } catch {
      log('  ⚠ WebView2 在线安装器下载失败，安装包跳过随带（目标机通常已自带运行时）')
    }
  }
  if (fs.existsSync(bootstrapper)) {
    fs.copyFileSync(bootstrapper, path.join(outDir, 'MicrosoftEdgeWebview2Setup.exe'))
  }
}

/** 生成 NSIS 变量文件（BOM + CRLF：makensis 靠 BOM 识别 UTF-8 中文） */
export function writeInstallerVars(desktopDir, values) {
  const text = [
    '; 由 scripts/build-package.mjs 生成，请勿手改',
    `!define APP_VERSION "${values.version}"`,
    `!define APP_PUBLISHER "${values.publisher}"`,
    `!define STAGE_DIR "${values.stageDir}"`,
    `!define OUT_FILE "${values.outFile}"`,
    '',
  ].join('\n')
  writeUtf8Bom(path.join(desktopDir, 'build', 'installer-vars.nsh'), text)
}

export function resolveMakensis(desktopDir, log, fail) {
  const cacheRoot = path.join(desktopDir, '.cache', 'nsis', 'extract')
  const candidates = [
    process.env.MAKENSIS,
    path.join(cacheRoot, 'makensis.exe'),
    path.join(cacheRoot, 'Bin', 'makensis.exe'),
    path.join(process.env.USERPROFILE || '', 'scoop', 'apps', 'nsis', 'current', 'makensis.exe'),
    'C:\\Program Files (x86)\\NSIS\\makensis.exe',
    'C:\\Program Files\\NSIS\\makensis.exe',
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  const probe = spawnSync('where', ['makensis'], { encoding: 'utf8' })
  if (probe.status === 0) {
    const first = probe.stdout.split(/\r?\n/).find(Boolean)
    if (first) return first.trim()
  }

  // 本机没有 NSIS：从 npmmirror 下载 NSIS 编译器并解压到 .cache
  log('下载 NSIS 编译器（首次打包约 1.2 MB）')
  const cacheDir = path.join(desktopDir, '.cache', 'nsis')
  const pkg = path.join(cacheDir, 'nsis-3.0.4.1.7z')
  download(NSIS_URL, pkg, log, fail)

  const sevenZip = find7z()
  if (!sevenZip) {
    fail('解压 NSIS 需要 7-Zip：请安装 7-Zip 或把 7z.exe 加入 PATH 后重试')
  }
  const extract = spawnSync(sevenZip, ['x', pkg, `-o${cacheRoot}`, '-y'], { encoding: 'utf8' })
  if (extract.status !== 0) {
    fail(`解压 NSIS 失败：${(extract.stderr || extract.stdout || '').trim()}`)
  }

  const cached = path.join(cacheRoot, 'makensis.exe')
  const cachedBin = path.join(cacheRoot, 'Bin', 'makensis.exe')
  if (fs.existsSync(cached)) return cached
  if (fs.existsSync(cachedBin)) return cachedBin
  fail('NSIS 解压完成但未找到 makensis.exe')
}

function find7z() {
  const candidates = [
    process.env.SEVENZIP,
    'C:\\Program Files\\7-Zip\\7z.exe',
    'C:\\Program Files (x86)\\7-Zip\\7z.exe',
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  for (const name of ['7z', '7za']) {
    const probe = spawnSync('where', [name], { encoding: 'utf8' })
    if (probe.status === 0) {
      const first = probe.stdout.split(/\r?\n/).find(Boolean)
      if (first) return first.trim()
    }
  }
  return null
}
