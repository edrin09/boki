/**
 * P14 HTTP 接口验证：登录 → 查询引擎状态 → 上传图片识别。
 *
 * 用法：node test/ocr-http.mjs [baseUrl]
 */
import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import * as fs from 'node:fs'

const BASE = process.argv[2] || 'http://127.0.0.1:3100/api'
const USERNAME = process.env.SMOKE_USERNAME || 'admin'
const PASSWORD = process.env.SMOKE_PASSWORD || '123456'

const FONT = ['C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/simhei.ttf'].find((p) => fs.existsSync(p))
GlobalFonts.registerFromPath(FONT, 'HttpTestCJK')

function makeInvoice() {
  const width = 900
  const lines = ['增值税电子普通发票', '发票号码 25312000000098765432', '价税合计 (小写) ¥1234.00']
  const height = lines.length * 60 + 60
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'top'
  lines.forEach((line, i) => {
    ctx.font = `${i === 0 ? 38 : 28}px "HttpTestCJK"`
    ctx.fillText(line, 40, 30 + i * 60)
  })
  return canvas.toBuffer('image/png')
}

async function main() {
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  })
  const loginBody = await loginRes.json()
  const token = loginBody?.data?.token || loginBody?.data?.accessToken
  console.log(`登录: HTTP ${loginRes.status}  token=${token ? '已获取' : '缺失'}`)
  if (!token) {
    console.log('  响应:', JSON.stringify(loginBody).slice(0, 300))
    process.exit(1)
  }
  const auth = { Authorization: `Bearer ${token}` }

  const statusRes = await fetch(`${BASE}/ocr/status`, { headers: auth })
  const statusBody = await statusRes.json()
  console.log(`状态: HTTP ${statusRes.status}  ${JSON.stringify(statusBody?.data ?? statusBody)}`)

  const form = new FormData()
  form.append('file', new Blob([makeInvoice()], { type: 'image/png' }), 'invoice.png')
  const recRes = await fetch(`${BASE}/ocr/recognize`, { method: 'POST', headers: auth, body: form })
  const recBody = await recRes.json()
  console.log(`识别: HTTP ${recRes.status}`)
  const data = recBody?.data ?? recBody
  if (Array.isArray(data?.lines)) {
    console.log(`  尺寸 ${data.width}x${data.height}  用时 ${data.elapsedMs}ms  文本框 ${data.lines.length}`)
    data.lines.forEach((l) => console.log(`    ${l.score.toFixed(3)}  ${l.text}`))
  } else {
    console.log('  响应:', JSON.stringify(recBody).slice(0, 400))
  }

  const noFile = await fetch(`${BASE}/ocr/recognize`, { method: 'POST', headers: auth, body: new FormData() })
  console.log(`空上传: HTTP ${noFile.status}（预期 400）`)
}

main().catch((err) => {
  console.error('失败:', err.message)
  process.exit(1)
})