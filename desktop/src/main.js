const fs = require('node:fs')
const path = require('node:path')
const { app, BrowserWindow, Menu, Tray, dialog, shell, clipboard, nativeImage, powerSaveBlocker } =
  require('electron')
const { paths, loadConfig, lanAddresses } = require('./config')
const { ServerProcess, isPortFree, waitReady } = require('./server')
const { appTitle: APP_TITLE, officialSite, windowTitle, publisher, email, phone, wechat } = require('./contact')
// 首次启动要建表 + 灌 75 科目/73 权限种子，新装机器上还要被 Defender 全量扫描
// 数万个小文件，实测冷启动可达 2 分钟以上。90 秒会把这种正常情况误判为失败，
// 因此放宽到 5 分钟；超时后也不会把界面卡死，而是让用户选择继续等待。
const READY_TIMEOUT_MS = 300000
const MAX_AUTO_RESTARTS = 3

let mainWindow = null
let tray = null
let server = null
let config = null
let powerBlockerId = null
let quitting = false
let restarts = 0
let hintedTray = false

const LOADING_PAGE = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
font-family:"Microsoft YaHei","PingFang SC",sans-serif;background:#f2f4f7;color:#1f2937}
.box{text-align:center}.spin{width:36px;height:36px;border:3px solid #e5e7eb;
border-top-color:#4F46E5;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 18px}
@keyframes spin{to{transform:rotate(360deg)}}
.t{font-size:15px}.s{margin-top:8px;font-size:12px;color:#6b7280}
</style></head><body><div class="box"><div class="spin"></div>
<div class="t">正在启动服务…</div>
<div class="s">首次启动需初始化数据库，约 1-3 分钟，请耐心等待</div></div></body></html>`

function appUrl() {
  return `http://127.0.0.1:${config.port}`
}

function iconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.ico')
    : path.join(__dirname, '..', 'build', 'icon.ico')
}

function showError(title, message, detail) {
  dialog.showMessageBoxSync({
    type: 'error',
    title,
    message,
    detail,
    buttons: ['确定'],
    noLink: true,
  })
}

/** 服务异常退出时自动重启；连续失败 3 次则停止并提示，避免无意义重启循环 */
async function handleCrash(reason, err) {
  if (quitting) return
  restarts += 1
  server.log(`自动重启尝试 ${restarts}/${MAX_AUTO_RESTARTS}（原因：${reason}）`)

  if (restarts > MAX_AUTO_RESTARTS) {
    showError(
      '服务启动失败',
      `后端连续 ${MAX_AUTO_RESTARTS} 次启动失败，已停止重试。`,
      `日志文件：${paths.logFile}\n${err ? `错误：${err.message}` : ''}`,
    )
    return
  }

  await new Promise((r) => setTimeout(r, 2000))
  if (quitting) return
  server.start(config.port, config.jwtSecret)
  const ready = await waitReady(config.port, READY_TIMEOUT_MS)
  if (ready) {
    restarts = 0
    if (mainWindow) mainWindow.loadURL(appUrl())
  }
}

/**
 * 写一行到 server.log。
 *
 * packaged 模式下 console 输出无处可看（无附着终端），而插件铺载失败恰恰是
 * 「装完才崩」类问题，必须落盘才能远程排查。
 */
function logToFile(line) {
  try {
    fs.appendFileSync(paths.logFile, `[${new Date().toISOString()}] ${line}\n`)
  } catch {
    // 日志失败不能影响主流程
  }
}

/**
 * 首次启动的插件 provision。
 *
 * 官方插件种子随包放在 resources/server/data/plugins（只读），而 server.js 把
 * BOKI_PLUGINS_DIR 指向 ProgramData 下可写目录。新装机器上该目录为空，后端会
 * 零插件启动——多公司/OCR/票据等接口全部 404（端到端验证 0/24 的根因）。
 * 这里在拉起后端前把种子铺过去：经 .seeding 临时目录整体 rename，避免复制
 * 中途失败留下半套插件；state.json 已存在则直接跳过，用户此后的安装/停用
 * 决策（升级不覆盖）保持不变。
 */
function ensurePluginsSeed() {
  if (!app.isPackaged) return
  const target = path.join(paths.root, 'plugins')
  const seed = path.join(process.resourcesPath, 'server', 'data', 'plugins')
  if (!fs.existsSync(path.join(seed, 'state.json'))) {
    const msg = `[plugins] 随包插件种子缺失：${seed}，插件功能将不可用`
    console.warn(msg)
    logToFile(msg)
    return
  }
  if (fs.existsSync(path.join(target, 'state.json'))) return
  const staging = `${target}.seeding`
  try {
    fs.rmSync(staging, { recursive: true, force: true })
    fs.cpSync(seed, staging, { recursive: true })
    fs.renameSync(staging, target)
    const msg = `[plugins] 已初始化插件目录：${target}`
    console.log(msg)
    logToFile(msg)
  } catch (err) {
    const msg = `[plugins] 插件种子铺载失败：${err.message}`
    console.error(msg)
    logToFile(msg)
  }
}

/** 「关于」对话框：开发者与联系方式（值来自根 .env，构建时生成 contact.js） */
function showAbout() {
  const detail = `开发者：${publisher}\n电子邮箱：${email}\n联系电话：${phone}\n微    信：${wechat}\n官    网：${officialSite}`
  dialog
    .showMessageBox({
      type: 'info',
      title: `关于 ${APP_TITLE}`,
      message: `${APP_TITLE} 桌面版 v${app.getVersion()}`,
      detail,
      // 原生 MessageBox 的文本不可选中，复制/打开官网靠这两个按钮兜底
      buttons: ['复制联系方式', '访问官网', '关闭'],
      defaultId: 2,
      noLink: true,
    })
    .then(({ response }) => {
      if (response === 0) {
        clipboard.writeText(detail)
        tray?.displayBalloon({ title: APP_TITLE, content: '开发者与联系方式已复制到剪贴板' })
      } else if (response === 1) {
        shell.openExternal(officialSite)
      }
    })
}

function buildTrayMenu() {
  const addresses = lanAddresses()
  return Menu.buildFromTemplate([
    { label: `本机访问：${appUrl()}`, click: () => mainWindow?.show() },
    {
      label: '复制局域网地址',
      enabled: addresses.length > 0,
      submenu: addresses.map((item) => ({
        label: `${item.address}（${item.name}）`,
        click: () => {
          clipboard.writeText(`http://${item.address}:${config.port}`)
          tray?.displayBalloon({
            title: APP_TITLE,
            content: `已复制：http://${item.address}:${config.port}`,
          })
        },
      })),
    },
    { type: 'separator' },
    { label: '打开界面', click: () => mainWindow?.show() },
    { label: '打开数据目录', click: () => shell.openPath(paths.data) },
    { label: '打开日志', click: () => shell.openPath(paths.logFile) },
    { label: '访问官网', click: () => shell.openExternal(officialSite) },
    { label: `关于 ${APP_TITLE}`, click: showAbout },
    { type: 'separator' },
    {
      label: '重启服务',
      click: async () => {
        if (mainWindow) mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(LOADING_PAGE))
        const ready = await server.restart(config.port, config.jwtSecret, READY_TIMEOUT_MS)
        restarts = 0
        if (ready) {
          mainWindow?.loadURL(appUrl())
        } else {
          showError('服务启动失败', '后端未能就绪。', `日志文件：${paths.logFile}`)
        }
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        quitting = true
        app.quit()
      },
    },
  ])
}

function createTray() {
  const icon = nativeImage.createFromPath(iconPath())
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip(APP_TITLE)
  tray.setContextMenu(buildTrayMenu())
  tray.on('double-click', () => mainWindow?.show())
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    title: windowTitle,
    icon: iconPath(),
    show: false,
    backgroundColor: '#f2f4f7',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  // 关窗即最小化到托盘：主机就是服务器，误关会导致全员无法访问
  mainWindow.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    mainWindow.hide()
    if (!hintedTray) {
      hintedTray = true
      tray?.displayBalloon({
        title: APP_TITLE,
        content: '程序已最小化到托盘继续运行，同事仍可访问。需完全退出请右键托盘图标选择「退出」。',
      })
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(LOADING_PAGE))
}

async function bootstrap() {
  config = loadConfig()

  // 端口冲突是现场最常见故障，必须明确报错而非静默失败
  if (!(await isPortFree(config.port))) {
    const choice = dialog.showMessageBoxSync({
      type: 'error',
      title: APP_TITLE,
      message: `端口 ${config.port} 已被占用，服务无法启动。`,
      detail: `请关闭占用该端口的程序后重试，或修改配置文件中的 port 换一个端口。\n\n配置文件：${paths.configFile}`,
      buttons: ['打开配置文件', '退出'],
      defaultId: 0,
      noLink: true,
    })
    if (choice === 0) shell.openPath(paths.configFile)
    app.quit()
    return
  }

  server = new ServerProcess(app.isPackaged)
  server.onCrash = handleCrash

  // 先铺插件种子，再拉后端：后端启动时一次性加载已启用插件
  ensurePluginsSeed()

  createWindow()
  createTray()
  // 主机休眠会导致全员断连，这是最容易被忽略的可用性杀手
  powerBlockerId = powerSaveBlocker.start('prevent-app-suspension')

  server.start(config.port, config.jwtSecret)

  // 超时不能是死胡同：后端往往只是慢（冷启动），稍后就会就绪。
  // 这里反复给用户「继续等待」的机会，一旦就绪立即进入界面，绝不把界面永久
  // 停在加载页——此前超时后直接 return，后端随后起来也进不去，只能重启程序。
  let ready = await waitReady(config.port, READY_TIMEOUT_MS)
  while (!ready && !quitting) {
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      title: APP_TITLE,
      message: '服务启动比预期慢',
      detail: `后端仍在初始化（首次启动较慢属正常），可继续等待。\n\n日志文件：${paths.logFile}`,
      buttons: ['继续等待', '打开日志', '退出'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    })
    if (choice === 1) {
      shell.openPath(paths.logFile)
      continue
    }
    if (choice === 2) {
      quitting = true
      app.quit()
      return
    }
    ready = await waitReady(config.port, READY_TIMEOUT_MS)
  }
  if (!ready) return

  restarts = 0
  mainWindow?.loadURL(appUrl())
}

if (!app.requestSingleInstanceLock()) {
  // 双开会抢 SQLite 与端口，表现为莫名启动失败
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  Menu.setApplicationMenu(null)

  app.whenReady().then(bootstrap)

  app.on('window-all-closed', () => {
    // 托盘常驻，不随窗口关闭退出
  })

  app.on('before-quit', (event) => {
    quitting = true
    if (server && server.child) {
      event.preventDefault()
      if (powerBlockerId !== null) powerSaveBlocker.stop(powerBlockerId)
      server.stop().finally(() => app.exit(0))
    }
  })
}