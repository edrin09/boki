const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')

/** 应用在 ProgramData 下的目录名 */
const APP_DIR_NAME = 'BOKI'

/** 默认端口：避开开发常用的 3000 */
const DEFAULT_PORT = 9300

/**
 * 数据根目录。
 *
 * 必须是 Program Files 之外的可写目录：安装目录对普通用户只读，
 * SQLite 建库与 WAL 写入会直接失败。ProgramData 默认对
 * Authenticated Users 可写，标准用户账户也能正常使用。
 */
function dataRoot() {
  const base = process.env.PROGRAMDATA || path.join('C:', 'ProgramData')
  return path.join(base, APP_DIR_NAME)
}

const paths = {
  root: dataRoot(),
  data: path.join(dataRoot(), 'data'),
  backup: path.join(dataRoot(), 'data', 'backup'),
  uploads: path.join(dataRoot(), 'data', 'uploads'),
  logs: path.join(dataRoot(), 'logs'),
  configFile: path.join(dataRoot(), 'config.json'),
  dbFile: path.join(dataRoot(), 'data', 'financial.db'),
  /** vault 元数据（加密状态标记），与数据库同目录 */
  vaultFile: path.join(dataRoot(), 'data', 'vault.json'),
  /**
   * 主密钥文件（32 字节 hex）。
   *
   * 放在**程序根目录**（安装版 = ProgramData\BOKI 根目录，开发版 = 仓库根目录），
   * 而不是安装目录：Program Files 对普通用户只读，转换旧库时无法原子写 key。
   * 它不随卸载删除；重装后同一把钥匙仍能打开原有账套。
   */
  vaultKeyFile: path.join(dataRoot(), 'vault.key'),
  logFile: path.join(dataRoot(), 'logs', 'server.log'),
}

function ensureDirs() {
  for (const dir of [paths.root, paths.data, paths.backup, paths.uploads, paths.logs]) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function readConfig() {
  try {
    const raw = fs.readFileSync(paths.configFile, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeConfig(cfg) {
  fs.writeFileSync(paths.configFile, JSON.stringify(cfg, null, 2), 'utf8')
}

/**
 * 读取或初始化运行配置。
 *
 * jwtSecret 首次生成后持久化：轮换会让既有 token 失效，
 * 每次重启都换会导致用户被反复登出。
 */
function loadConfig() {
  ensureDirs()
  const cfg = readConfig()
  let dirty = false

  if (!Number.isInteger(cfg.port) || cfg.port < 1 || cfg.port > 65535) {
    cfg.port = DEFAULT_PORT
    dirty = true
  }
  if (typeof cfg.jwtSecret !== 'string' || cfg.jwtSecret.length < 32) {
    cfg.jwtSecret = crypto.randomBytes(32).toString('hex')
    dirty = true
  }
  if (dirty) writeConfig(cfg)
  return cfg
}

/** 枚举非内部 IPv4，多网卡机器全部列出由用户选择 */
function lanAddresses() {
  const result = []
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const info of interfaces[name] || []) {
      if (info.family === 'IPv4' && !info.internal) {
        result.push({ name, address: info.address })
      }
    }
  }
  return result
}

module.exports = { paths, loadConfig, writeConfig, ensureDirs, lanAddresses, DEFAULT_PORT }