/**
 * 生成应用图标 desktop/build/icon.ico 与安装器欢迎页 logo desktop/build/installer-logo.bmp
 *
 * 源文件使用品牌资产（brand/）：
 *   - boki-mark.svg   主标志（32px 及以上各尺寸）
 *   - favicon.svg     简化标志（16/24px 小尺寸可读性更好）
 *   - boki-wordmark.svg  文字标志（深墨色，用于浅色底）
 *
 * 用 sharp（借 backend 的依赖）把 SVG 光栅化为多尺寸 PNG，
 * ICO 按容器格式封装（PNG 内嵌，256 尺寸允许直接存 PNG 数据）；
 * 安装器 logo 为透明底横版（mark + wordmark 合成），展平到 NSIS 对话框
 * 标准灰底（F0F0F0，与安装页底色一致，视觉等效透明）后封装 24 位 BMP
 * （NSIS nsDialogs 的 ${NSD_SetImage} 用 LoadImage 加载，只吃 BMP）。
 *
 * 用法：node scripts/make-icon.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.resolve(__dirname, '..')
const repoRoot = path.resolve(desktopDir, '..')

const require = createRequire(import.meta.url)
const sharp = require(path.join(repoRoot, 'backend', 'node_modules', 'sharp'))

const MARK_SVG = path.join(repoRoot, 'brand', 'boki-mark.svg')
const FAVICON_SVG = path.join(repoRoot, 'brand', 'favicon.svg')
const WORDMARK_SVG = path.join(repoRoot, 'brand', 'boki-wordmark.svg')

/** [尺寸, 源文件] —— 小尺寸用简化标志，保证 16px 可读 */
const SIZES = [
  [16, FAVICON_SVG],
  [24, FAVICON_SVG],
  [32, MARK_SVG],
  [48, MARK_SVG],
  [64, MARK_SVG],
  [128, MARK_SVG],
  [256, MARK_SVG],
]

/** ICONDIR + 每图一条 ICONDIRENTRY + PNG 数据 */
function buildIco(pngs) {
  const count = pngs.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(count, 4)

  const dirSize = 6 + 16 * count
  let offset = dirSize
  const entries = []
  const datas = []
  for (const { size, data } of pngs) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0) // width（256 记为 0）
    entry.writeUInt8(size >= 256 ? 0 : size, 1) // height（256 记为 0）
    entry.writeUInt8(0, 2) // 调色板数
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // color planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    datas.push(data)
    offset += data.length
  }

  return Buffer.concat([header, ...entries, ...datas])
}

const pngs = []
for (const [size, src] of SIZES) {
  const svg = fs.readFileSync(src)
  const data = await sharp(svg).resize(size, size).png().toBuffer()
  pngs.push({ size, data })
}

const outDir = path.join(desktopDir, 'build')
fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, 'icon.ico')
fs.writeFileSync(outFile, buildIco(pngs))
console.log(`图标已生成: ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(1)} KB, ${pngs.length} 尺寸)`)

// ---------- 安装器欢迎页横版 logo：透明底 mark + wordmark → 24 位 BMP ----------

/** 24 位 bottom-up BGR 无压缩 BMP（NSIS LoadImage 兼容） */
function buildBmp24(rgb, width, height) {
  const rowSize = Math.floor((24 * width + 31) / 32) * 4
  const imageSize = rowSize * height
  const fileSize = 14 + 40 + imageSize
  const buf = Buffer.alloc(fileSize)
  // BITMAPFILEHEADER
  buf.write('BM', 0)
  buf.writeUInt32LE(fileSize, 2)
  buf.writeUInt32LE(0, 6)
  buf.writeUInt32LE(14 + 40, 10)
  // BITMAPINFOHEADER
  buf.writeUInt32LE(40, 14)
  buf.writeInt32LE(width, 18)
  buf.writeInt32LE(height, 22) // 正数 = bottom-up
  buf.writeUInt16LE(1, 26) // planes
  buf.writeUInt16LE(24, 28) // bpp
  buf.writeUInt32LE(0, 30) // BI_RGB 无压缩
  buf.writeUInt32LE(imageSize, 34)
  // 像素：sharp raw 是 top-down RGB，BMP 要 bottom-up BGR，逐行翻转 + 通道交换
  const srcRow = width * 3
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * srcRow
    const dst = 54 + y * rowSize
    for (let x = 0; x < width; x++) {
      buf[dst + x * 3 + 0] = rgb[src + x * 3 + 2] // B
      buf[dst + x * 3 + 1] = rgb[src + x * 3 + 1] // G
      buf[dst + x * 3 + 2] = rgb[src + x * 3 + 0] // R
    }
  }
  return buf
}

// 安装页 logo 尺寸与 installer-hooks.nsh 的位图控件（108u x 32u）严格对应：
// NSIS 位图控件不做缩放，BMP 必须按 native 像素生成——96 DPI 下 1u ≈ 1.67px，
// 180x54px 恰好等于 108x32u，控件多大图就多大，不会溢出盖住下方文字。
const LOGO_W = 180
const LOGO_H = 54
const markPng = await sharp(MARK_SVG).resize(54, 54).png().toBuffer()
const wordPng = await sharp(WORDMARK_SVG).resize(112, null).png().toBuffer()
const logoPng = await sharp({
  create: { width: LOGO_W, height: LOGO_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([
    { input: markPng, left: 0, top: 0 },
    { input: wordPng, left: 62, top: 8 },
  ])
  .png()
  .toBuffer()
// 安装页背景是 NSIS 对话框标准灰（F0F0F0，installer-hooks.nsh 里也用
// SetCtlColors 把页面固定为该色），BMP 无 alpha 通道，展平到同色即"视觉透明"，
// 避免白底位图在灰底对话框上留下一块白补丁
const logoRgb = await sharp(logoPng).flatten({ background: '#F0F0F0' }).raw().toBuffer()
const logoFile = path.join(outDir, 'installer-logo.bmp')
fs.writeFileSync(logoFile, buildBmp24(logoRgb, LOGO_W, LOGO_H))
console.log(`安装器 logo 已生成: ${logoFile} (${(fs.statSync(logoFile).size / 1024).toFixed(1)} KB, ${LOGO_W}x${LOGO_H} 24bpp)`)
