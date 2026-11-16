// 掘金封面生成器：1200×630（按 2x 输出 2400×1260）
// 用法：node assets/covers/build.mjs
// 依赖：本机 Chrome（headless 截图），无第三方 npm 包
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

// aside = 右侧玻璃卡片里的代码/清单，lines: [文本, 类名]
const covers = [
  {
    file: 'cover-main',
    kicker: '开放式 AI · 开源财务软件',
    title: ['模型你选', '数据不出门', 'AI 只写草稿'],
    grad: 2,
    size: 64,
    tags: ['本地模型断网可跑', '只读 MCP', '写入只落草稿'],
    title2: '只读 MCP · 真实请求',
    lines: [
      ['POST /api/mcp', 'k'],
      ['{"jsonrpc":"2.0","method":"tools/call",', 'c'],
      [' "params":{"name":"account.balance",', 'c'],
      ['           "arguments":{"period":202611}}}', 'c'],
      ['', ''],
      ['✓ 余额 128,400.00', 'ok'],
      ['✕ voucher.create → 工具不存在', 'err'],
    ],
    foot: 'AGPL-3.0  ·  github.com/edrin09/boki',
  },
  {
    file: 'cover-02-draft-gate',
    kicker: '技术长文 · 架构设计',
    title: ['为什么我们不让', 'AI 直接改账'],
    grad: 1,
    size: 66,
    tags: ['草稿闸门', '启动期拒绝', '运行期扫描'],
    title2: 'landing 白名单 · 源码',
    lines: [
      ["ALLOWED = ['draft', 'list', 'archive']", 'c'],
      ['', ''],
      ['assertLanding(plan)   // 启动期', 'k'],
      ['assertDraftOnly(req)  // 每次写', 'k'],
      ['', ''],
      ['✓ voucher.createDraft', 'ok'],
      ['✕ voucher.create  (direct)', 'err'],
    ],
    foot: 'BOKI · 三道锁之二  ·  github.com/edrin09/boki',
  },
  {
    file: 'cover-03-readonly-mcp',
    kicker: '技术长文 · MCP 生态',
    title: ['让 Claude 查你的账本', '但改不了它'],
    grad: 1,
    size: 56,
    tags: ['POST /api/mcp', '8 个只读工具', '零写工具'],
    title2: 'tools/list · 注册表',
    lines: [
      ['register(tool) {', 'c'],
      ['  if (!tool.readOnly) return   // 丢弃', 'c'],
      ['  this.tools.set(tool.name, tool)', 'c'],
      ['}', 'c'],
      ['', ''],
      ['✓ account.balance  ✓ ledger.detail', 'ok'],
      ['✕ voucher.create → not found', 'err'],
    ],
    foot: 'BOKI · 三道锁之三  ·  github.com/edrin09/boki',
  },
  {
    file: 'cover-09-token-vuln',
    kicker: '安全复盘 · 自查披露',
    title: ['任何人都能', '替你确认指令'],
    grad: 1,
    size: 66,
    tags: ['根因：user.id 恒为 undefined', 'CVSS 3.1 · 4.3', '已修复 · 无发布版本受影响'],
    title2: '令牌归属校验 · 修复前',
    lines: [
      ['found.userId        // undefined', 'c'],
      ['userId              // undefined', 'c'],
      ['undefined !== undefined  // false', 'c'],
      ['', ''],
      ['→ 静默通过，永不报错', 'err'],
      ['', ''],
      ['requireUserId(user)  // 拿不到就 401', 'ok'],
    ],
    foot: 'BOKI · 漏洞复盘  ·  github.com/edrin09/boki',
  },
]

const html = (c) => `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif;
    background:
      radial-gradient(780px 420px at 46% -14%, rgba(79,70,229,.52), transparent 62%),
      radial-gradient(660px 380px at 4% 112%, rgba(14,165,233,.26), transparent 60%),
      radial-gradient(560px 340px at 98% 96%, rgba(79,70,229,.22), transparent 62%),
      #0B1220;
    color: #fff; padding: 48px 60px 40px; display: flex; flex-direction: column;
    position: relative;
  }
  body::after {
    content: ""; position: absolute; inset: 0; pointer-events: none;
    background-image: linear-gradient(rgba(255,255,255,.032) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(255,255,255,.032) 1px, transparent 1px);
    background-size: 60px 60px;
    -webkit-mask-image: radial-gradient(72% 64% at 46% 34%, #000 24%, transparent 100%);
  }
  .top { display: flex; align-items: center; gap: 13px; position: relative; z-index: 2; }
  .mark {
    width: 40px; height: 40px; border-radius: 11px; display: grid; place-items: center;
    background: linear-gradient(135deg, #4F46E5, #0EA5E9); font-weight: 800; font-size: 21px;
    box-shadow: 0 8px 24px rgba(79,70,229,.5);
  }
  .wordmark { font-size: 25px; font-weight: 800; letter-spacing: -.6px; }
  .kicker {
    margin-left: 4px; font-size: 13.5px; font-weight: 600; color: #C7D2FE;
    border: 1px solid rgba(199,210,254,.26); background: rgba(255,255,255,.06);
    padding: 5px 13px; border-radius: 999px;
  }
  .mid { flex: 1; display: flex; align-items: center; gap: 44px; position: relative; z-index: 2; }
  .left { flex: 1; min-width: 0; padding-bottom: 6px; }
  h1 { font-size: ${c.size}px; line-height: 1.24; font-weight: 800; letter-spacing: -2px; }
  h1 span { display: block; white-space: nowrap; }
  h1 .g {
    background: linear-gradient(100deg, #A5B4FC, #7DD3FC 56%, #93C5FD);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .tags { display: flex; gap: 10px; margin-top: 28px; flex-wrap: wrap; }
  .tags span {
    font-size: 14.5px; font-weight: 600; color: #E2E8F0; padding: 7px 14px; border-radius: 999px;
    background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.13);
  }
  .aside {
    width: 452px; flex: none; border-radius: 16px; overflow: hidden;
    background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.115);
    box-shadow: 0 26px 60px rgba(2,6,23,.55); backdrop-filter: blur(4px);
  }
  .aside-bar {
    display: flex; align-items: center; gap: 8px; padding: 11px 16px;
    border-bottom: 1px solid rgba(255,255,255,.09); background: rgba(255,255,255,.03);
  }
  .aside-bar i { width: 9px; height: 9px; border-radius: 50%; background: rgba(148,163,184,.5); }
  .aside-bar span { margin-left: 6px; font-size: 12px; color: #94A3B8; letter-spacing: .3px; }
  .aside pre {
    padding: 18px 18px 20px; font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 13px; line-height: 1.85; white-space: pre; color: #CBD5E1;
  }
  .k { color: #A5B4FC; font-weight: 700; }
  .c { color: #CBD5E1; }
  .ok { color: #6EE7B7; }
  .err { color: #FCA5A5; }
  .foot {
    position: relative; z-index: 2; display: flex; justify-content: space-between; align-items: center;
    font-size: 14px; color: rgba(148,163,184,.95);
    border-top: 1px solid rgba(255,255,255,.09); padding-top: 14px;
  }
  .dot { color: #34D399; }
</style></head>
<body>
  <div class="top">
    <div class="mark">B</div>
    <div class="wordmark">boki</div>
    <div class="kicker">${c.kicker}</div>
  </div>
  <div class="mid">
    <div class="left">
      <h1>${c.title.map((t, i) => `<span${i === c.grad ? ' class="g"' : ''}>${t}</span>`).join('')}</h1>
      <div class="tags">${c.tags.map((t) => `<span>${t}</span>`).join('')}</div>
    </div>
    <div class="aside">
      <div class="aside-bar"><i></i><i></i><i></i><span>${c.title2}</span></div>
      <pre>${c.lines.map(([t, k]) => (k ? `<span class="${k}">${t}</span>` : t)).join('\n')}</pre>
    </div>
  </div>
  <div class="foot"><span>${c.foot}</span><span class="dot">● 离线优先 · 零云端依赖</span></div>
</body></html>`

mkdirSync(resolve(here, 'src'), { recursive: true })
for (const c of covers) {
  const src = resolve(here, 'src', `${c.file}.html`)
  writeFileSync(src, html(c), 'utf8')
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
    '--force-device-scale-factor=2', '--window-size=1200,630',
    '--virtual-time-budget=1200', `--screenshot=${resolve(here, `${c.file}.png`)}`,
    'file:///' + src.replace(/\\/g, '/'),
  ], { stdio: 'ignore' })
  console.log('ok', `${c.file}.png`)
}
rmSync(resolve(here, 'src'), { recursive: true, force: true })
