#!/usr/bin/env node
/**
 * 桌面版一键发布：构建安装包 → 打 tag → GitHub Release → Gitee 发行版
 *
 * 前置（本机）：
 *   - git 远程已配好（origin=GitHub, gitee=Gitee）且可推送
 *   - GitHub CLI `gh` 已登录：gh auth login
 *   - Gitee 令牌：令牌：令牌：令牌：令牌：令牌：令牌：令牌：令牌：令牌：令牌：令牌：令牌：令牌：令牌：令牌：令牌：令牌：desktop/.env 或仓库根 .env，或全局共享 D:\wwwroot\.git-tokens.env：GITEE_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *   - 如需签名：设置 CSC_LINK / CSC_KEY_PASSWORD（或系统证书库已有匹配 publisherName 的证书）
 *
 * 用法：
 *   node scripts/release.mjs                 # 全量：构建 + 发布
 *   node scripts/release.mjs --skip-build    # release/ 下已有 exe 时，只发布
 *   node scripts/release.mjs --dry-run       # 仅打印将执行的操作，不实际发布
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.resolve(__dirname, '..')
const repoRoot = path.resolve(desktopDir, '..')
const releaseDir = path.join(desktopDir, 'release')

const args = process.argv.slice(2)
const skipBuild = args.includes('--skip-build')
const dryRun = args.includes('--dry-run')

// 读取 .env（desktop/.env、仓库根 .env、全局共享 *.git-tokens.env），仅填充未设置的变量
function loadEnv() {
  const sharedTokens = path.resolve(repoRoot, '..', '.git-tokens.env')
  for (const p of [path.join(desktopDir, '.env'), path.join(repoRoot, '.env'), sharedTokens]) {
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    }
  }
}
loadEnv()

const GITHUB_REPO = process.env.GITHUB_REPO || 'edrin09/boki'
const GITEE_OWNER = process.env.GITEE_OWNER || 'edrin'
const GITEE_REPO = process.env.GITEE_REPO || 'boki'
const GITEE_TOKEN = process.env.GITEE_TOKEN
const DEV_NAME = process.env.PUBLISHER_NAME || ''
const CONTACT_EMAIL = process.env.CONTACT_EMAIL
const CONTACT_PHONE = process.env.CONTACT_PHONE
const CONTACT_WECHAT = process.env.CONTACT_WECHAT
const CONTACT_LINE =
  CONTACT_EMAIL || CONTACT_PHONE || CONTACT_WECHAT
    ? `\n\n联系方式：${[
        CONTACT_EMAIL && `邮箱 ${CONTACT_EMAIL}`,
        CONTACT_PHONE && `电话 ${CONTACT_PHONE}`,
        CONTACT_WECHAT && `微信 ${CONTACT_WECHAT}`,
      ]
        .filter(Boolean)
        .join('，')}`
    : ''

const pkg = JSON.parse(fs.readFileSync(path.join(desktopDir, 'package.json'), 'utf8'))
const VERSION = pkg.version
const TAG = `v${VERSION}`
const exeName = `BOKI-Setup-${VERSION}.exe`
const exePath = path.join(releaseDir, exeName)

function log(m) { console.log(`[发布] ${m}`) }
function fail(m) { console.error(`[发布] 失败：${m}`); process.exit(1) }
function run(cmd, cmdArgs, opts = {}) {
  log(`运行 ${path.basename(String(cmd))} ${cmdArgs.join(' ')}`)
  if (dryRun) return { status: 0, dry: true }
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', ...opts })
  if (r.error) fail(r.error.message)
  if (r.status !== 0) fail(`${cmd} 退出码 ${r.status}`)
  return r
}
function runOut(cmd, cmdArgs, opts = {}) {
  return spawnSync(cmd, cmdArgs, { encoding: 'utf8', ...opts })
}

// ---- 1. 构建安装包 ----
if (!skipBuild) {
  log('构建安装包（node scripts/build-package.mjs）')
  run(process.execPath, [path.join(desktopDir, 'scripts', 'build-package.mjs')], { cwd: desktopDir })
} else {
  log('跳过构建（--skip-build）')
}
if (!fs.existsSync(exePath)) fail(`未找到安装包：${exePath}（去掉 --skip-build 先构建，或核对版本号）`)
log(`安装包就绪：${exePath} (${(fs.statSync(exePath).size / 1024 / 1024).toFixed(1)} MB)`)

// ---- 2. 打 tag 并推送双远程 ----
log(`打标签 ${TAG} 并推送到 origin / gitee`)
if (!dryRun) {
  const tagRes = runOut('git', ['tag', TAG], { cwd: repoRoot })
  if (tagRes.status !== 0 && !(tagRes.stderr || '').includes('already exists')) {
    log(`创建本地 tag 提示：${(tagRes.stderr || '').trim() || '已存在'}`)
  }
  const p1 = runOut('git', ['push', 'origin', TAG], { cwd: repoRoot })
  if (p1.status !== 0) log(`⚠️ 推送 tag 到 origin 失败（可能已存在）：${(p1.stderr || '').trim()}`)
  const p2 = runOut('git', ['push', 'gitee', TAG], { cwd: repoRoot })
  if (p2.status !== 0) log(`⚠️ 推送 tag 到 gitee 失败（可能已存在）：${(p2.stderr || '').trim()}`)
}

// ---- 3. GitHub Release ----
log('创建 GitHub Release 并上传安装包')
if (dryRun) {
  log(`(dry-run) gh release create ${TAG} ${exePath} --repo ${GITHUB_REPO} --title "BOKI ${VERSION}"`)
} else {
  if (runOut('gh', ['--version']).status !== 0) fail('未找到 GitHub CLI（gh），请先安装并用 gh auth login 登录')
  const notes = `BOKI ${VERSION} Windows 安装包\n\n离线一体式安装包（自带 Node 运行时，无需联网、无需预装环境），装完即用。由 ${DEV_NAME} 签名发布。${CONTACT_LINE}`
  const r = runOut('gh', [
    'release', 'create', TAG, exePath,
    '--repo', GITHUB_REPO,
    '--title', `BOKI ${VERSION}`,
    '--notes', notes,
  ])
  if (r.status !== 0) fail(`gh release create 失败：${(r.stderr || '').trim()}`)
  log('GitHub Release 创建完成')
}

// ---- 4. Gitee 发行版 ----
log('创建 Gitee 发行版并上传安装包')
if (!GITEE_TOKEN) {
  log('未配置 GITEE_TOKEN，跳过 Gitee（在 D:\\wwwroot\\D:\\wwwroot\\.git-tokensgit-tokens.env 写入 GITEE_TOKEN=xxx 后重试）')
} else if (dryRun) {
  log(`(dry-run) POST gitee releases + 上传 ${exePath}`)
} else {
  const base = `https://gitee.com/api/v5/repos/${GITEE_OWNER}/${GITEE_REPO}`
  const notes = `BOKI ${VERSION} Windows 安装包\n\n离线一体式安装包（自带 Node 运行时，无需联网、无需预装环境），装完即用。由 ${DEV_NAME} 签名发布。${CONTACT_LINE}`
  const create = await fetch(`${base}/releases?access_token=${GITEE_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag_name: TAG, name: `BOKI ${VERSION}`, body: notes, prerelease: false }),
  })
  const rel = await create.json().catch(() => ({}))
  if (!rel.id) fail(`Gitee 创建发行版失败：${JSON.stringify(rel)}`)
  log(`Gitee 发行版已建 id=${rel.id}`)
  const form = new FormData()
  form.append('file', new Blob([fs.readFileSync(exePath)], { type: 'application/octet-stream' }), exeName)
  const up = await fetch(`${base}/releases/${rel.id}/attach_files?access_token=${GITEE_TOKEN}`, {
    method: 'POST',
    body: form,
  })
  const upj = await up.json().catch(() => ({}))
  if (up.status === 200 || upj.id || upj.computation_file_info) log('Gitee 附件上传完成')
  else log(`Gitee 附件上传返回：${JSON.stringify(upj)}`)
}

log('完成 ✅')
log(`GitHub: https://github.com/${GITHUB_REPO}/releases/tag/${TAG}`)
log(`Gitee:   https://gitee.com/${GITEE_OWNER}/${GITEE_REPO}/releases`)
