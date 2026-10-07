/**
 * P15 上传与票据解析验证：
 *  1. 带文本层的电子发票 PDF → 文本层直抽 → 发票字段结构化
 *  2. 同文件重复上传 → sha256 去重
 *  3. 合成发票图片 → OCR 路径 → 发票字段抽取
 *  4. 不同文件但发票代码+号码相同 → 发票组合去重
 *  5. 列表 / 详情 / 类型校验
 *
 * 用法：node test/receipts-verify.mjs [baseUrl]
 */
import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import { createRequire } from 'node:module'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

const BASE = process.argv[2] || 'http://127.0.0.1:3100/api'
const USERNAME = process.env.SMOKE_USERNAME || 'admin'
const PASSWORD = process.env.SMOKE_PASSWORD || '123456'

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(here, 'output')
fs.mkdirSync(outDir, { recursive: true })

const FONT_CANDIDATES = [
  'C:/Windows/Fonts/simhei.ttf',
  'C:/Windows/Fonts/msyh.ttc',
  'C:/Windows/Fonts/simsun.ttc',
]
const FONT = FONT_CANDIDATES.find((p) => fs.existsSync(p))
if (!FONT) throw new Error('未找到中文字体')
GlobalFonts.registerFromPath(FONT, 'ReceiptCJK')

let passed = 0
let failed = 0
function check(name, ok, extra = '') {
  if (ok) {
    passed++
    console.log(`  PASS  ${name}${extra ? '  ' + extra : ''}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${extra ? '  ' + extra : ''}`)
  }
}

/** 生成带文本层的"电子发票"PDF（pdfkit + 中文字体） */
function buildInvoicePdf(opts = {}) {
  return new Promise((resolve, reject) => {
    const PDFDocument = require('pdfkit')
    const doc = new PDFDocument({ size: [595, 780], margin: 36 })
    doc.font(FONT)
    doc.fontSize(18).text('增值税电子普通发票', 36, 30)
    doc.moveDown()
    doc.fontSize(12)
    const lines = [
      `发票代码：${opts.code ?? '1100181311'}`,
      `发票号码：${opts.no ?? '31211201'}`,
      '开票日期：2024年01月15日',
      '购买方信息',
      `名称：${opts.buyer ?? '上海某某科技有限公司'}`,
      '纳税人识别号：91310000MA1FL2KX3T',
      '销售方信息',
      `名称：${opts.seller ?? '北京某某信息技术服务有限公司'}`,
      '纳税人识别号：91110108MA01ABCDEF',
      '项目名称 金额 税率 税额',
      `信息技术服务 1000.00 6% 60.00`,
      '合计 ¥1000.00 ¥60.00',
      '价税合计（大写）壹仟零陆拾元整 （小写）¥1060.00',
      '备注',
      '收款人：张三 复核：李四 开票人：王五',
    ]
    for (const l of lines) doc.text(l, 36, doc.y + 6)
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    doc.end()
  })
}

/** 生成无文本层的"扫描件"PDF：页面仅嵌入发票图片，用于验证渲染+OCR 路径 */
function buildScannedPdf(imageBuf) {
  return new Promise((resolve, reject) => {
    const PDFDocument = require('pdfkit')
    const doc = new PDFDocument({ size: [1000, 700], margin: 0, autoFirstPage: false })
    doc.addPage({ size: [1000, 700] })
    doc.image(imageBuf, 0, 0, { width: 1000, height: 700 })
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    doc.end()
  })
}

/** 合成发票图片（OCR 路径，号码与 PDF 样张不同，避免组合去重拦截） */
function buildInvoiceImage(opts = {}) {
  const width = 1000
  const lines = [
    '增值税电子普通发票',
    `发票代码 ${opts.code ?? '1100181322'}`,
    `发票号码 ${opts.no ?? '31211902'}`,
    `开票日期 ${opts.date ?? '2024年02月20日'}`,
    '购买方名称 上海某某科技有限公司',
    '纳税人识别号 91310000MA1FL2KX3T',
    '销售方名称 北京某某信息技术服务有限公司',
    '纳税人识别号 91110108MA01ABCDEF',
    `合计 ¥${opts.amount ?? '2000.00'} ¥${opts.tax ?? '120.00'}`,
    `价税合计 ¥${opts.total ?? '2120.00'}`,
  ]
  const height = lines.length * 60 + 60
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'top'
  lines.forEach((line, i) => {
    ctx.font = `${i === 0 ? 38 : 28}px "ReceiptCJK"`
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
  console.log(`登录: HTTP ${loginRes.status}  token=${token ? 'OK' : '缺失'}`)
  if (!token) {
    console.log(JSON.stringify(loginBody).slice(0, 300))
    process.exit(1)
  }
  const auth = { Authorization: `Bearer ${token}` }

  // 清理历史记录（脚本可重复运行）
  const cleanRes = await fetch(`${BASE}/receipts?pageSize=100`, { headers: auth })
  const cleanBody = (await cleanRes.json())?.data ?? {}
  for (const item of cleanBody.items ?? []) {
    await fetch(`${BASE}/receipts/${item.id}`, { method: 'DELETE', headers: auth })
  }
  console.log(`清理历史票据: ${cleanBody.total ?? 0} 条`)

  // 1. 文本层 PDF → 发票解析
  console.log('\n=== 1. 文本层 PDF 上传（主路径） ===')
  const pdfBuf = await buildInvoicePdf()
  fs.writeFileSync(path.join(outDir, 'receipt-pdf-invoice.pdf'), pdfBuf)
  const pdfRes = await uploadFiles(auth, [{ name: '电子发票.pdf', buf: pdfBuf, mime: 'application/pdf' }])
  const pdfData = pdfRes.body?.data ?? pdfRes.body
  const pdfItem = pdfData?.[0]
  check('PDF 上传返回 200', pdfRes.status === 200, `HTTP ${pdfRes.status}`)
  check('PDF 识别成功(parsed)', pdfItem?.status === 'parsed', `status=${pdfItem?.status} type=${pdfItem?.receiptTypeName}`)
  check('PDF 判定为发票', pdfItem?.receiptType === 'invoice', `type=${pdfItem?.receiptType}`)
  const pdfFields = toFields(pdfItem)
  check('发票代码抽取', pdfFields.invoice_code === '1100181311', `invoice_code=${pdfFields.invoice_code}`)
  check('发票号码抽取', pdfFields.invoice_no === '31211201', `invoice_no=${pdfFields.invoice_no}`)
  check('价税合计抽取', pdfFields.total_amount === 1060, `total_amount=${pdfFields.total_amount}`)
  check('购买方名称抽取', String(pdfFields.buyer_name ?? '').includes('上海某某科技'), `buyer_name=${pdfFields.buyer_name}`)
  check('销售方税号抽取', pdfFields.seller_tax_no === '91110108MA01ABCDEF', `seller_tax_no=${pdfFields.seller_tax_no}`)
  check('开票日期抽取', pdfFields.issue_date === '2024-01-15', `issue_date=${pdfFields.issue_date}`)

  // 2. 同文件重复上传 → sha256 去重
  console.log('\n=== 2. 同文件重复上传（sha256 去重） ===')
  const dupRes = await uploadFiles(auth, [{ name: '电子发票.pdf', buf: pdfBuf, mime: 'application/pdf' }])
  const dupItem = (dupRes.body?.data ?? dupRes.body)?.[0]
  check('重复上传标记 duplicate', dupItem?.status === 'duplicate', `status=${dupItem?.status} msg=${dupItem?.message ?? ''}`)

  // 3. 发票图片 → OCR 路径
  console.log('\n=== 3. 合成发票图片（OCR 路径） ===')
  const imgBuf = buildInvoiceImage()
  fs.writeFileSync(path.join(outDir, 'receipt-img-invoice.png'), imgBuf)
  const imgRes = await uploadFiles(auth, [{ name: '发票照片.png', buf: imgBuf, mime: 'image/png' }])
  const imgItem = (imgRes.body?.data ?? imgRes.body)?.[0]
  check('图片上传返回 200', imgRes.status === 200, `HTTP ${imgRes.status}`)
  check('图片识别成功(parsed)', imgItem?.status === 'parsed', `status=${imgItem?.status} type=${imgItem?.receiptTypeName}`)
  check('图片判定为发票', imgItem?.receiptType === 'invoice', `type=${imgItem?.receiptType}`)
  const imgFields = toFields(imgItem)
  check('图片发票号码抽取', String(imgFields.invoice_no ?? '').includes('31211902'), `invoice_no=${imgFields.invoice_no}`)
  check('图片价税合计抽取', imgFields.total_amount === 2120, `total_amount=${imgFields.total_amount}`)

  // 4. 扫描件 PDF（无文本层 → 渲染为图 → OCR）
  console.log('\n=== 4. 扫描件 PDF（渲染 + OCR 路径） ===')
  const scanImg = buildInvoiceImage({ code: '1100181333', no: '31219903', date: '2024年03月10日', total: '3180.00', amount: '3000.00', tax: '180.00' })
  const scanBuf = await buildScannedPdf(scanImg)
  fs.writeFileSync(path.join(outDir, 'receipt-scan.pdf'), scanBuf)
  const scanRes = await uploadFiles(auth, [{ name: '扫描件.pdf', buf: scanBuf, mime: 'application/pdf' }])
  const scanItem = (scanRes.body?.data ?? scanRes.body)?.[0]
  check('扫描件解析成功(parsed)', scanItem?.status === 'parsed', `status=${scanItem?.status} type=${scanItem?.receiptTypeName} conf=${scanItem?.confidence}`)
  check('扫描件判定为发票', scanItem?.receiptType === 'invoice', `type=${scanItem?.receiptType}`)
  const scanFields = toFields(scanItem)
  check('扫描件发票号码抽取', String(scanFields.invoice_no ?? '').includes('31219903'), `invoice_no=${scanFields.invoice_no}`)

  // 5. 发票代码+号码组合去重（不同文件，仅改公司名）
  console.log('\n=== 5. 发票代码+号码组合去重 ===')
  const pdfBuf2 = await buildInvoicePdf({ buyer: '另一家公司有限公司', seller: '另一家销售公司' })
  const dup2Res = await uploadFiles(auth, [{ name: '电子发票-副本.pdf', buf: pdfBuf2, mime: 'application/pdf' }])
  const dup2Item = (dup2Res.body?.data ?? dup2Res.body)?.[0]
  check('同代码+号码标记 duplicate', dup2Item?.status === 'duplicate', `status=${dup2Item?.status} msg=${dup2Item?.message ?? ''}`)

  // 6. 列表 / 详情 / 类型校验
  console.log('\n=== 6. 列表 / 详情 / 类型校验 ===')
  const listRes = await fetch(`${BASE}/receipts?page=1&pageSize=10`, { headers: auth })
  const listBody = await listRes.json()
  const listData = listBody?.data ?? listBody
  check('列表返回 200', listRes.status === 200, `HTTP ${listRes.status} total=${listData?.total}`)
  check('列表含发票记录', Array.isArray(listData?.items) && listData.items.length >= 1)

  const detailRes = await fetch(`${BASE}/receipts/${pdfItem?.receiptId}`, { headers: auth })
  const detailBody = await detailRes.json()
  const detailData = detailBody?.data ?? detailBody
  check('详情返回 200', detailRes.status === 200, `HTTP ${detailRes.status}`)
  check('详情含结构化字段', Array.isArray(detailData?.fields) && detailData.fields.length > 0)

  const typeRes = await fetch(`${BASE}/receipts?receiptType=bogus`, { headers: auth })
  check('非法类型返回 400', typeRes.status === 400, `HTTP ${typeRes.status}`)

  console.log(`\n结果: ${passed} 通过 / ${failed} 失败`)
  process.exit(failed ? 1 : 0)
}

function toFields(item) {
  const map = {}
  for (const f of item?.fields ?? []) map[f.key] = f.value
  return map
}

async function uploadFiles(auth, files) {
  const form = new FormData()
  for (const f of files) {
    form.append('files', new Blob([f.buf], { type: f.mime }), f.name)
  }
  const res = await fetch(`${BASE}/receipts/upload`, { method: 'POST', headers: auth, body: form })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

main().catch((err) => {
  console.error('验证失败:', err)
  process.exit(1)
})
