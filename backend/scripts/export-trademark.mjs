/**
 * 导出商标申请用标样（1000×1000，白底，JPG + PNG）
 *
 * 用法（在 backend 目录）：
 *   node scripts/export-trademark.mjs
 *
 * 输出到 brand/trademark/：
 *   BOKI-wordmark-1000.jpg / .png
 *   BOKI-logo-1000.jpg / .png
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const backendDir = process.cwd()
const root = path.resolve(backendDir, '..')
const dir = path.join(root, 'brand', 'trademark')

const jobs = [
  { src: 'BOKI-wordmark-source.svg', base: 'BOKI-wordmark' },
  { src: 'BOKI-logo-source.svg', base: 'BOKI-logo' },
]

if (!fs.existsSync(dir)) {
  console.error(`目录不存在: ${dir}`)
  process.exit(1)
}

for (const job of jobs) {
  const srcPath = path.join(dir, job.src)
  if (!fs.existsSync(srcPath)) {
    console.error(`缺少源文件: ${srcPath}`)
    process.exit(1)
  }

  const svg = fs.readFileSync(srcPath)

  // 渲染为 1000×1000 PNG（白底，无透明）
  const png = await sharp(svg, { density: 300 })
    .resize(1000, 1000, { fit: 'contain', background: '#ffffff' })
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer()

  const pngPath = path.join(dir, `${job.base}-1000.png`)
  const jpgPath = path.join(dir, `${job.base}-1000.jpg`)
  fs.writeFileSync(pngPath, png)

  await sharp(png)
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
    .toFile(jpgPath)

  const meta = await sharp(jpgPath).metadata()
  const kb = (fs.statSync(jpgPath).size / 1024).toFixed(1)
  console.log(`✔ ${job.base}-1000.jpg  ${meta.width}×${meta.height}  ${kb} KB`)
  console.log(`  ${job.base}-1000.png`)
}

console.log('\n完成。标样位于 brand/trademark/')
