/**
 * 插件打包：源码目录 → zip + sha256 + 发布元数据。
 *
 * 打包规则（方案 P2）：
 *   - 排除 .ts / .tsx / .map / node_modules（源码与调试产物不上服务器）；
 *   - 排除 .git / dist / 隐藏文件、.env、私钥、备份与日志；
 *   - 条目按路径排序，输出稳定；
 *   - manifest.json 必须在根目录，id 必须与目录名一致。
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { CliError } from './errors.mjs'
import { createZip, readZip } from './zip.mjs'

const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

const EXCLUDED_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', 'dist', '__pycache__', '.idea', '.vscode', 'coverage'])
const EXCLUDED_FILE_NAMES = new Set(['.DS_Store', 'Thumbs.db', '.env'])
const EXCLUDED_SUFFIXES = ['.ts', '.tsx', '.map', '.zip', '.bak', '.log', '.private', '.pem', '.tmp', '.swp']

export function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

export function isSemver(value) {
  return typeof value === 'string' && SEMVER_RE.test(value)
}

function isExcludedFile(name) {
  if (EXCLUDED_FILE_NAMES.has(name)) return true
  if (name.startsWith('.')) return true
  return EXCLUDED_SUFFIXES.some((suffix) => name.endsWith(suffix))
}

function walk(root) {
  const files = []
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) {
        throw new CliError(`插件目录包含符号链接，打包前请先处理：${path.relative(root, full)}`)
      }
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
        stack.push(full)
        continue
      }
      if (!entry.isFile() || isExcludedFile(entry.name)) continue
      files.push(full)
    }
  }
  return files.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
}

function zipName(root, file) {
  return path.relative(root, file).split(path.sep).join('/')
}

/** 读取并校验 manifest.json（不读 manifest 之外的插件逻辑，保持 CLI 轻量） */
export function readPluginManifest(pluginDir) {
  const manifestFile = path.join(pluginDir, 'manifest.json')
  if (!fs.existsSync(manifestFile)) {
    throw new CliError(`不是插件目录：缺少 ${path.join(pluginDir, 'manifest.json')}`)
  }

  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  } catch (error) {
    throw new CliError(`manifest.json 不是合法 JSON：${error.message}`)
  }

  if (!PLUGIN_ID_RE.test(String(manifest?.id ?? ''))) {
    throw new CliError('manifest.id 不合法（要求 ^[a-z0-9][a-z0-9-]{0,63}$）')
  }
  const dirName = path.basename(path.resolve(pluginDir))
  if (dirName !== manifest.id) {
    throw new CliError(`目录名 ${dirName} 与 manifest.id ${manifest.id} 不一致，避免发布错包`)
  }
  if (!String(manifest?.name ?? '').trim()) throw new CliError('manifest.name 不能为空')
  if (!isSemver(manifest?.version)) throw new CliError(`manifest.version 必须是 SemVer，当前为 ${JSON.stringify(manifest?.version)}`)
  if (!String(manifest?.apiVersion ?? '').trim()) throw new CliError('manifest.apiVersion 不能为空')
  if (manifest?.engines !== undefined && (typeof manifest.engines !== 'object' || Array.isArray(manifest.engines))) {
    throw new CliError('manifest.engines 必须是对象，例如 {"boki":">=1.0.0"}')
  }

  return manifest
}

function isInside(parent, child) {
  const relative = path.relative(parent, child)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

/**
 * @param {{ pluginDir: string, distDir: string, outFile?: string, mtime?: Date }} options
 */
export function packPlugin({ pluginDir, distDir, outFile }) {
  const source = path.resolve(pluginDir)
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    throw new CliError(`插件目录不存在：${source}`)
  }

  const manifest = readPluginManifest(source)
  const target = path.resolve(
    outFile || path.join(distDir, 'plugins', `${manifest.id}-${manifest.version}.zip`),
  )
  if (isInside(source, target)) {
    throw new CliError('输出 zip 不能放在插件源码目录内（避免下次打包把制品带进去）')
  }

  const files = walk(source)
  if (!files.length) throw new CliError('插件目录没有可打包的文件')

  const entries = files.map((file) => ({
    name: zipName(source, file),
    data: fs.readFileSync(file),
    mtime: fs.statSync(file).mtime,
    mode: 0o644,
  }))

  const zip = createZip(entries)
  // 发布前自检：写出去的东西必须能被自己读回来（CRC / 大小 / 条目数）
  const parsed = readZip(zip)
  if (parsed.size !== entries.length) throw new CliError('打包自检失败：条目数不一致')
  if (!parsed.has('manifest.json')) throw new CliError('打包自检失败：manifest.json 未进入 zip')

  fs.mkdirSync(path.dirname(target), { recursive: true })
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(temp, zip)
  fs.renameSync(temp, target)

  const metadata = {
    pluginId: manifest.id,
    name: manifest.name,
    version: manifest.version,
    apiVersion: manifest.apiVersion,
    engines: manifest.engines ?? null,
    zipPath: target,
    sha256: sha256Hex(zip),
    size: zip.length,
    fileCount: entries.length,
    files: files.map((file) => zipName(source, file)),
    createdAt: new Date().toISOString(),
  }

  const sidecar = `${target}.json`
  fs.writeFileSync(sidecar, `${JSON.stringify(metadata, null, 2)}\n`)

  return { ...metadata, sidecar }
}

/** release 读取 pack 生成的 sidecar；不存在时返回 null（允许手工指定元数据） */
export function readPackMetadata(zipPath) {
  const sidecar = `${path.resolve(zipPath)}.json`
  if (!fs.existsSync(sidecar)) return null
  try {
    const metadata = JSON.parse(fs.readFileSync(sidecar, 'utf8'))
    if (metadata?.pluginId && metadata?.version && metadata?.sha256) return metadata
  } catch {
    /* 损坏的 sidecar 不阻断发布：以显式参数为准 */
  }
  return null
}
