/**
 * P16 档案一键录入验证：
 *  1. 营业执照图片 → POST /ocr/extract?target=partner → 名称/税号/法人/地址 建议值
 *  2. 身份证图片   → POST /ocr/extract?target=employee → 姓名/性别/身份证号 建议值
 *  3. 证件与档案目标不匹配 → docTypeMatched=false 且带提示
 *  4. 参数校验：非法 target / 缺少文件 → 400
 *  5. 批量建档：POST /partners/batch、POST /employees/batch
 *
 * 用法：node test/extract-verify.mjs [baseUrl]
 */
import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.argv[2] || 'http://127.0.0.1:3000/api'
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
GlobalFonts.registerFromPath(FONT, 'ExtractCJK')

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

/** 渲染白底黑字图片，供 OCR 识别 */
function renderImage(lines) {
  const width = 1240
  const height = lines.length * 66 + 60
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'top'
  lines.forEach((line, i) => {
    ctx.font = `${i === 0 ? 44 : 34}px "ExtractCJK"`
    ctx.fillText(line, 40, 30 + i * 66)
  })
  return canvas.toBuffer('image/png')
}

const LICENSE_LINES = [
  '营业执照',
  '统一社会信用代码 91310000MA1FL2KX3T',
  '名称 上海云帆智联科技有限公司',
  '类型 有限责任公司',
  '法定代表人 李四',
  '注册资本 100万元人民币',
  '成立日期 2018年05月20日',
  '住所 上海市浦东新区张江路100号',
  '经营范围 信息技术服务、软件开发',
]

const ID_CARD_LINES = [
  '中华人民共和国居民身份证',
  '姓名 张三',
  '性别 男 民族 汉',
  '出生 1990年1月1日',
  '住址 上海市浦东新区张江路100号',
  '公民身份号码 310101199001011234',
  '签发机关 上海市公安局',
  '有效期限 2020.01.01-2040.01.01',
]

const STAMP = Date.now().toString().slice(-6)
const PARTNER_NAMES = [`OCR测试甲公司${STAMP}`, `OCR测试乙公司${STAMP}`]
const EMPLOYEE_NAMES = [`OCR测试员工甲${STAMP}`, `OCR测试员工乙${STAMP}`]

async function extract(auth, buf, name, mime, target) {
  const form = new FormData()
  form.append('file', new Blob([buf], { type: mime }), name)
  const url = `${BASE}/ocr/extract${target === undefined ? '' : `?target=${target}`}`
  const res = await fetch(url, { method: 'POST', headers: auth, body: form })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, data: body?.data ?? body }
}

async function postJson(auth, url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, data: body?.data ?? body }
}

function listOf(data) {
  return data?.list ?? data?.items ?? []
}

async function cleanup(auth, url, keyword, names) {
  const res = await fetch(`${url}?keyword=${encodeURIComponent(keyword)}&pageSize=100`, { headers: auth })
  const body = await res.json().catch(() => ({}))
  const rows = listOf(body?.data ?? body)
  for (const row of rows) {
    if (names.includes(row.name)) {
      await fetch(`${url}/${row.id}`, { method: 'DELETE', headers: auth }).catch(() => {})
    }
  }
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

  const licenseBuf = renderImage(LICENSE_LINES)
  const idCardBuf = renderImage(ID_CARD_LINES)
  fs.writeFileSync(path.join(outDir, 'extract-license.png'), licenseBuf)
  fs.writeFileSync(path.join(outDir, 'extract-idcard.png'), idCardBuf)

  // 1. 营业执照 → 往来单位档案
  console.log('\n=== 1. 营业执照 → 往来单位 ===')
  const p1 = await extract(auth, licenseBuf, '营业执照.png', 'image/png', 'partner')
  check('返回 200', p1.status === 200, `HTTP ${p1.status}`)
  check('判定为营业执照', p1.data?.docType === 'business_license', `docType=${p1.data?.docType}`)
  check('证件类型匹配', p1.data?.docTypeMatched === true)
  const pv = p1.data?.values ?? {}
  check('名称建议值', String(pv.name ?? '').includes('云帆智联'), `name=${pv.name}`)
  check('纳税人识别号建议值', pv.taxNo === '91310000MA1FL2KX3T', `taxNo=${pv.taxNo}`)
  check('法定代表人建议值', String(pv.legalPerson ?? '').includes('李四'), `legalPerson=${pv.legalPerson}`)
  check('地址建议值', String(pv.address ?? '').length > 0, `address=${pv.address}`)
  const mappedPartner = (p1.data?.fields ?? []).filter((f) => f.targetKey)
  check('字段映射到档案字段', mappedPartner.length >= 4, `mapped=${mappedPartner.length}`)
  check('低置信字段默认不勾选', (p1.data?.fields ?? []).every((f) => !f.selected || f.confidence >= 0.6))

  // 2. 身份证 → 员工档案
  console.log('\n=== 2. 身份证 → 员工 ===')
  const e1 = await extract(auth, idCardBuf, '身份证.png', 'image/png', 'employee')
  check('返回 200', e1.status === 200, `HTTP ${e1.status}`)
  check('判定为身份证', e1.data?.docType === 'id_card', `docType=${e1.data?.docType}`)
  check('证件类型匹配', e1.data?.docTypeMatched === true)
  const ev = e1.data?.values ?? {}
  check('姓名建议值', String(ev.name ?? '').includes('张三'), `name=${ev.name}`)
  check('性别归一化为 male', ev.gender === 'male', `gender=${ev.gender}`)
  check('身份证号建议值', ev.idCard === '310101199001011234', `idCard=${ev.idCard}`)

  // 3. 证件与目标不匹配
  console.log('\n=== 3. 证件与档案目标不匹配 ===')
  const mismatch = await extract(auth, idCardBuf, '身份证.png', 'image/png', 'partner')
  check('返回 200', mismatch.status === 200, `HTTP ${mismatch.status}`)
  check('标记不匹配', mismatch.data?.docTypeMatched === false)
  check('给出提示文案', Boolean(mismatch.data?.message), `msg=${mismatch.data?.message ?? ''}`)

  // 4. 参数校验
  console.log('\n=== 4. 参数校验 ===')
  const badTarget = await extract(auth, licenseBuf, '营业执照.png', 'image/png', 'bogus')
  check('非法 target 返回 400', badTarget.status === 400, `HTTP ${badTarget.status}`)

  const noFileRes = await fetch(`${BASE}/ocr/extract?target=partner`, {
    method: 'POST',
    headers: auth,
    body: new FormData(),
  })
  check('未上传文件返回 400', noFileRes.status === 400, `HTTP ${noFileRes.status}`)

  const emptyFile = await extract(auth, Buffer.from(''), 'x.png', 'image/png', 'partner')
  check('空文件返回 400', emptyFile.status === 400, `HTTP ${emptyFile.status}`)

  const badMime = await extract(auth, Buffer.from('hello'), 'x.txt', 'text/plain', 'partner')
  check('非法文件类型返回 400', badMime.status === 400, `HTTP ${badMime.status}`)

  const corrupt = await extract(auth, Buffer.from('not-a-real-image'), 'x.png', 'image/png', 'partner')
  check('损坏文件返回 400', corrupt.status === 400, `HTTP ${corrupt.status}`)

  // 5. 批量建档
  console.log('\n=== 5. 批量建档 ===')
  await cleanup(auth, `${BASE}/partners`, 'OCR测试', PARTNER_NAMES)
  await cleanup(auth, `${BASE}/employees`, 'OCR测试', EMPLOYEE_NAMES)

  const partnerBatch = await postJson(auth, `${BASE}/partners/batch`, {
    items: [
      { name: PARTNER_NAMES[0], taxNo: '91310000MA1FL2KX3T', legalPerson: '李四', address: '上海市浦东新区张江路100号' },
      { name: PARTNER_NAMES[1], taxNo: '91310000MA1FL2KX3Z' },
    ],
  })
  check('往来单位批量返回 201/200', [200, 201].includes(partnerBatch.status), `HTTP ${partnerBatch.status}`)
  check('两条均成功', partnerBatch.data?.created === 2, `created=${partnerBatch.data?.created} failed=${partnerBatch.data?.failed}`)
  check('返回逐条结果', Array.isArray(partnerBatch.data?.results) && partnerBatch.data.results.length === 2)
  check('自动生成编码', partnerBatch.data?.results?.every((r) => r.success && r.code), `codes=${partnerBatch.data?.results?.map((r) => r.code).join(',')}`)

  const employeeBatch = await postJson(auth, `${BASE}/employees/batch`, {
    items: [
      { name: EMPLOYEE_NAMES[0], gender: 'male', idCard: '310101199001011234' },
      { name: EMPLOYEE_NAMES[1], gender: 'female', idCard: '310101199202022345' },
    ],
  })
  check('员工批量返回 201/200', [200, 201].includes(employeeBatch.status), `HTTP ${employeeBatch.status}`)
  check('两条均成功', employeeBatch.data?.created === 2, `created=${employeeBatch.data?.created} failed=${employeeBatch.data?.failed}`)

  const emptyBatch = await postJson(auth, `${BASE}/partners/batch`, { items: [] })
  check('空数组返回 400', emptyBatch.status === 400, `HTTP ${emptyBatch.status}`)
  const invalidBatch = await postJson(auth, `${BASE}/partners/batch`, { items: [{ name: '' }] })
  check('缺名称返回 400', invalidBatch.status === 400, `HTTP ${invalidBatch.status}`)

  // 清理测试数据
  await cleanup(auth, `${BASE}/partners`, 'OCR测试', PARTNER_NAMES)
  await cleanup(auth, `${BASE}/employees`, 'OCR测试', EMPLOYEE_NAMES)

  console.log(`\n结果: ${passed} 通过 / ${failed} 失败`)
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error('验证失败:', err)
  process.exit(1)
})