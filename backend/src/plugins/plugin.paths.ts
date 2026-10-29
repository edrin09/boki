import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * 插件相关路径解析。
 *
 * 约定：
 * - 工作目录默认是 backend/（npm scripts 均在此执行）
 * - 安装目录：pluginsRootDir()（桌面端指向 ProgramData 下可写目录）
 * - 内核编译产物：backend/dist（插件通过 @core 引用）
 *
 * 只有「已安装插件目录」一个路径。插件包一律由远程插件市场下载安装，
 * 客户端不带任何随包插件或本地插件目录，因此这里也不再有任何目录回退。
 */
export function resolveBackendRoot(): string {
  const fromEnv = process.env.BOKI_BACKEND_ROOT
  if (fromEnv) return path.resolve(fromEnv)

  const cwd = process.cwd()
  if (fs.existsSync(path.join(cwd, 'package.json')) && fs.existsSync(path.join(cwd, 'src'))) {
    return cwd
  }
  // dist/plugins 下运行时向上两级即为 backend
  const viaDir = path.resolve(__dirname, '../..')
  if (fs.existsSync(path.join(viaDir, 'package.json'))) return viaDir
  return cwd
}

export function pluginsRootDir(): string {
  const raw = process.env.BOKI_PLUGINS_DIR
  if (raw) return path.resolve(raw)
  return path.resolve(resolveBackendRoot(), 'data/plugins')
}

export function coreDistDir(): string {
  return path.resolve(resolveBackendRoot(), 'dist')
}

export function stateFilePath(): string {
  return path.join(pluginsRootDir(), 'state.json')
}

export function syncRequiredMarker(): string {
  return path.join(pluginsRootDir(), '.sync-required')
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export function readJson<T>(file: string): T | null {
  try {
    if (!fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

export function writeJson(file: string, value: unknown): void {
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8')
}
