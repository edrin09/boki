/**
 * P14 离线 OCR 引擎验证：合成票据样张 → 检测 → 方向分类 → 识别。
 *
 * 运行：node test/ocr-verify.mjs
 */
import { createRequire } from 'node:module'
import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(here, 'output')
fs.mkdirSync(outDir, { recursive: true })

const FONT_CANDIDATES = [
  'C:/Windows/Fonts/msyh.ttc',
  'C:/Windows/Fonts/simhei.ttf',
  'C:/Windows/Fonts/simsun.ttc',
  'C:/Windows/Fonts/msyh.ttf',
]
const FAMILY = 'OcrTestCJK'
const fontPath = FONT_CANDIDATES.find((p) => fs.existsSync(p))
if (!fontPath) throw new Error('未找到可用的中文字体')
const registered = GlobalFonts.registerFromPath(fontPath, FAMILY)
console.log(`字体: ${fontPath}  注册=${registered}`)

const LINES = [
  '增值税电子普通发票',
  '发票号码 25312000000098765432',
  '开票日期 2026年10月06日',
  '购买方名称 杭州某某科技有限公司',
  '纳税人识别号 91330100MA2AB1CD5X',
  '价税合计 (小写) ¥1234.00',
]

function renderInvoice({ scale = 1, rotate = 0, jpeg = false } = {}) {
  const width = 1000
  const lineHeight = 62
  const height = LINES.length * lineHeight + 80
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'top'
  LINES.forEach((line, i) => {
    ctx.font = `${i === 0 ? 40 : 30}px "${FAMILY}"`
    ctx.fillText(line, 48, 40 + i * lineHeight)
  })

  let source = canvas
  if (rotate === 180) {
    const rotated = createCanvas(width, height)
    const rctx = rotated.getContext('2d')
    rctx.translate(width, height)
    rctx.rotate(Math.PI)
    rctx.drawImage(canvas, 0, 0)
    source = rotated
  }

  let outCanvas = source
  let outWidth = width
  let outHeight = height
  if (scale !== 1) {
    outWidth = Math.round(width * scale)
    outHeight = Math.round(height * scale)
    outCanvas = createCanvas(outWidth, outHeight)
    outCanvas.getContext('2d').drawImage(source, 0, 0, outWidth, outHeight)
  }

  const buf = jpeg ? outCanvas.toBuffer('image/jpeg', 60) : outCanvas.toBuffer('image/png')
  return { buf, width: outWidth, height: outHeight }
}

/** 全角与半角标点折半，避免把字体渲染差异算成识别错误 */
function normalize(s) {
  return s
    .replace(/\uFFE5/g, '\u00A5')
    .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, '')
    .replace(/\s/g, '')
    .toUpperCase()
}

function similarity(expected, actual) {
  const a = normalize(expected)
  const b = [...normalize(actual)]
  if (!a.length) return 0
  let hit = 0
  const used = new Array(b.length).fill(false)
  for (const ch of a) {
    const idx = b.findIndex((c, i) => !used[i] && c === ch)
    if (idx >= 0) {
      used[idx] = true
      hit++
    }
  }
  return hit / a.length
}

async function main() {
  const { OcrEngine } = require('../data/plugins/ocr/server/modules/ocr/engine/ocr.engine.js')
  const engine = new OcrEngine()
  await engine.onModuleInit()
  if (!engine.isReady()) {
    console.error('引擎未就绪，检查模型目录')
    process.exit(1)
  }

  const cases = [
    { name: 'invoice-1000', img: renderInvoice() },
    { name: 'invoice-rot180', img: renderInvoice({ rotate: 180 }) },
    { name: 'invoice-photo-jpeg60', img: renderInvoice({ scale: 0.7, jpeg: true }) },
  ]

  for (const c of cases) {
    const file = path.join(outDir, `${c.name}.png`)
    fs.writeFileSync(file, c.img.buf)
    const result = await engine.recognize(c.img.buf)
    console.log(`\n===== ${c.name}  ${c.img.width}x${c.img.height}  用时 ${result.elapsedMs}ms  文本框 ${result.lines.length} 个`)
    for (const line of result.lines) {
      const [x1, y1, x2] = line.points[0].concat(line.points[2][0])
      console.log(`  [${String(Math.round(x1)).padStart(4)},${String(Math.round(y1)).padStart(4)}-${String(Math.round(x2)).padStart(4)}] ${line.score.toFixed(3)}  ${line.text}`)
    }

    const joined = result.lines.map((l) => l.text).join(' ')
    console.log('  ---- 逐行比对')
    let sum = 0
    for (const expected of LINES) {
      let best = 0
      for (const line of result.lines) best = Math.max(best, similarity(expected, line.text))
      sum += best
      const flag = best >= 0.9 ? 'OK  ' : best >= 0.7 ? 'WARN' : 'FAIL'
      console.log(`  ${flag} ${(best * 100).toFixed(0).padStart(3)}%  ${expected}`)
    }
    console.log(`  ---- 平均相似度 ${((sum / LINES.length) * 100).toFixed(1)}%`)
    console.log(`  ---- 原始拼接: ${joined}`)
  }
}

main().catch((err) => {
  console.error('验证失败:', err)
  process.exit(1)
})