const fs = require('node:fs')
const http = require('node:http')
const net = require('node:net')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { paths } = require('./config')
const contact = require('./contact')

/** 日志单文件上限，超出后轮转为 server.log.1 */
const LOG_MAX_BYTES = 5 * 1024 * 1024

/**
 * 后端产物位置。
 *
 * 打包后由 extraResources 落在 resources/server 与 resources/web；
 * 开发期直接指向仓库内的 backend 与 frontend/dist。
 */
function resolveLayout(isPackaged) {
  if (isPackaged) {
    const serverDir = path.join(process.resourcesPath, 'server')
    return {
      serverDir,
      webDir: path.join(process.resourcesPath, 'web'),
      nodeExe: path.join(serverDir, 'node.exe'),
      entry: path.join(serverDir, 'dist', 'main.js'),
      modelDir: path.join(serverDir, 'models', 'ocr'),
    }
  }

  const repoRoot = path.resolve(__dirname, '..', '..')
  const serverDir = path.join(repoRoot, 'backend')
  return {
    serverDir,
    webDir: path.join(repoRoot, 'frontend', 'dist'),
    // 开发期不能用 Electron 内置 Node：其 ABI 与 better-sqlite3 预编译包不一致
    nodeExe: process.env.NODE_EXE || 'node',
    entry: path.join(serverDir, 'dist', 'main.js'),
    modelDir: path.join(serverDir, 'models', 'ocr'),
  }
}

/** 端口是否可绑定（后端监听 0.0.0.0） */
function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer()
    probe.once('error', () => resolve(false))
    probe.once('listening', () => probe.close(() => resolve(true)))
    probe.listen(port, '0.0.0.0')
  })
}

/**
 * 等待后端就绪。
 *
 * 收到任意 HTTP 状态码即视为就绪（401/404 也算）——只要 TCP + HTTP 栈起来了，
 * 前端就能访问。绝不能用固定 sleep：首次启动要建表并灌 75 科目 / 73 权限种子，
 * 耗时不稳定。
 */
function waitReady(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve) => {
    const attempt = () => {
      if (Date.now() > deadline) return resolve(false)
      const req = http.get(
        { host: '127.0.0.1', port, path: '/api', timeout: 2000 },
        (res) => {
          res.resume()
          resolve(true)
        },
      )
      req.on('timeout', () => req.destroy())
      req.on('error', () => setTimeout(attempt, 400))
    }
    attempt()
  })
}

class ServerProcess {
  constructor(isPackaged) {
    this.layout = resolveLayout(isPackaged)
    this.child = null
    this.stopping = false
    this.restarts = 0
    this.onCrash = null
    this.stream = null
  }

  /** 追加日志；超过上限先轮转，避免无限增长占满磁盘 */
  log(line) {
    try {
      if (fs.existsSync(paths.logFile) && fs.statSync(paths.logFile).size > LOG_MAX_BYTES) {
        this.stream?.end()
        fs.renameSync(paths.logFile, `${paths.logFile}.1`)
        this.stream = null
      }
      if (!this.stream) {
        this.stream = fs.createWriteStream(paths.logFile, { flags: 'a' })
      }
      this.stream.write(`[${new Date().toISOString()}] ${line}\n`)
    } catch {
      // 日志失败不能影响主流程
    }
  }

  buildEnv(port, jwtSecret) {
    const { layout } = this
    return {
      ...process.env,
      NODE_ENV: 'production',
      APP_PORT: String(port),
      APP_PREFIX: 'api',
      DB_DATABASE: paths.dbFile,
      // 插件安装/运行时目录：默认解析是 <安装目录>/data/plugins，而 Program Files
      // 对标准用户只读，mkdir 直接 EPERM 让后端连环崩溃（实测 3 次重启全挂）。
      // 必须显式指到 ProgramData 下可写位置，与数据库同根。
      BOKI_PLUGINS_DIR: path.join(paths.root, 'plugins'),
      // 插件代码含裸依赖（onnxruntime-node / sharp / @nestjs/* / typeorm …）。
      // Node 从插件文件位置逐级向上找 node_modules，而插件在 ProgramData 下，
      // 这条链够不到 resources/server/node_modules（开发期能向上找到
      // backend/node_modules 纯属目录布局巧合）。NODE_PATH 仍被 CJS require
      // 支持，显式补上随包依赖目录，插件加载才不会 MODULE_NOT_FOUND。
      NODE_PATH: path.join(layout.serverDir, 'node_modules'),
      // 加密状态文件路径（后端默认取 DB_DATABASE 同目录，这里显式指定更直白）
      VAULT_FILE: paths.vaultFile,
      // 主密钥文件：固定放程序根目录，安装版落在 ProgramData\BOKI\vault.key
      VAULT_KEY_FILE: paths.vaultKeyFile,
      // 保留 true：升级后新增实体/字段可自动同步，无需手工迁移
      DB_SYNCHRONIZE: 'true',
      DB_LOGGING: 'false',
      UPLOAD_DIR: paths.uploads,
      OCR_MODEL_DIR: layout.modelDir,
      WEB_DIST_DIR: layout.webDir,
      JWT_SECRET: jwtSecret,
      JWT_EXPIRES_IN: '8h',
      CORS_ORIGIN: '*',
      INIT_ADMIN_USERNAME: 'admin',
      INIT_ADMIN_PASSWORD: '123456',
      INIT_ADMIN_NICKNAME: '系统管理员',
      // 应用身份与联系方式：与「关于」对话框同源（contact.js ← 仓库根 .env），
      // 经 GET /api/meta 提供给前端（登录页署名等），桌面/Web 两端一致
      APP_TITLE: contact.appTitle,
      OFFICIAL_SITE: contact.officialSite,
      PUBLISHER_NAME: contact.publisher,
      CONTACT_EMAIL: contact.email,
      CONTACT_PHONE: contact.phone,
      CONTACT_WECHAT: contact.wechat,
    }
  }

  start(port, jwtSecret) {
    const { layout } = this
    this.stopping = false
    this.log(`--- 启动后端: ${layout.nodeExe} ${layout.entry} (port=${port}) ---`)

    this.child = spawn(layout.nodeExe, [layout.entry], {
      cwd: layout.serverDir,
      env: this.buildEnv(port, jwtSecret),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    this.child.stdout.on('data', (d) => this.log(d.toString().trimEnd()))
    this.child.stderr.on('data', (d) => this.log(d.toString().trimEnd()))

    this.child.on('error', (err) => {
      this.log(`子进程启动失败: ${err.message}`)
      this.onCrash?.('spawn-error', err)
    })

    this.child.on('exit', (code, signal) => {
      this.child = null
      if (this.stopping) {
        this.log(`后端已停止 (code=${code})`)
        return
      }
      this.log(`后端异常退出 (code=${code} signal=${signal})`)
      this.onCrash?.('exit', null)
    })
  }

  async stop() {
    this.stopping = true
    const child = this.child
    if (!child) return
    await new Promise((resolve) => {
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
      child.kill()
    })
  }

  async restart(port, jwtSecret, timeoutMs = 300000) {
    await this.stop()
    this.start(port, jwtSecret)
    return waitReady(port, timeoutMs)
  }
}

module.exports = { ServerProcess, isPortFree, waitReady, resolveLayout }