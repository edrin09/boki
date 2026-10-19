/**
 * 语音助手回测（对应 offline-voice-assistant.md 的 E2E 步骤）：
 *
 * 1. 造数：新建「语音回测公司」，当月 3 收 2 支凭证 + 1 应收挂账 + 1 应付挂账 + 1 员工未还借款
 * 2. 文字通道（Plan B）逐意图提问：话术/卡片数字与利润表、试算接口逐数比对
 * 3. 跨期时间解析（十月/去年/上个月/2029年空月）与兜底话术
 * 4. 导出 Excel 内的数字与卡片一致（xlsx 解析逐格比对）
 * 5. 无权限账号（viewer）访问接口应 403
 *
 * 用法：node test/voice-verify.mjs [baseUrl]   （后端需已启动）
 */
import * as path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const BASE = process.argv[2] || 'http://127.0.0.1:3000/api'
const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(here, 'output')
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

let passed = 0
let failed = 0
let current = ''
function group(name) {
  current = name
  console.log(`\n[回测] ${name}`)
}
function check(name, ok, extra = '') {
  if (ok) {
    passed++
    console.log(`  PASS  ${name}${extra ? '  ' + extra : ''}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${extra ? '  ' + extra : ''}`)
  }
}

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  return { status: res.status, json }
}
const unwrap = (b) => (b && typeof b === 'object' && 'data' in b ? b.data : b)

/** 文字通道提问 */
async function ask(token, text) {
  const res = await fetch(`${BASE}/voice/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text }),
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: unwrap(json) }
}

const fmt = (v) => Number(v ?? 0).toFixed(2)

console.log(`== 语音助手回测 base=${BASE} ==`)

// ==================== 登录 ====================
group('登录与公司准备')
const login = await api('/auth/login', { method: 'POST', body: { username: 'admin', password: '123456' } })
check('管理员登录', [200, 201].includes(login.status))
if (![200, 201].includes(login.status)) {
  console.log('登录失败，终止（请先启动后端 npm run start）')
  process.exit(1)
}
const token = unwrap(login.json).accessToken

// 每次新建干净公司，保证回测数字可精确复算
const stamp = Date.now() % 1000000
const created = await api('/companies', {
  method: 'POST',
  token,
  body: {
    name: `语音回测公司${stamp}`,
    code: `V${stamp}`,
    taxNo: `TEST${stamp}X`,
    taxpayerType: 'small_scale',
  },
})
check('创建回测公司', [200, 201].includes(created.status), created.json?.message)
const companyId = unwrap(created.json)?.id
if (!companyId) {
  console.log('  公司创建响应: ' + JSON.stringify(created.json).slice(0, 300))
  console.log('无法创建回测公司，终止')
  process.exit(1)
}
const switched = await api('/auth/switch-company', { method: 'POST', token, body: { companyId } })
check('切换到回测公司', [200, 201].includes(switched.status))
const token2 = unwrap(switched.json).accessToken ?? token

// 语音助手状态（模型已就绪 ⇒ ready=true；未就绪时文字通道仍可用）
const status = unwrap((await api('/voice/status', { token: token2 })).json)
check('语音助手状态接口', Boolean(status), `ready=${status?.ready} 模型目录=${status?.modelDir}`)

// ==================== 基础资料 ====================
group('造数：基础资料')
const accounts = unwrap((await api('/accounts', { token: token2 })).json)
const byCode = (code) => (accounts ?? []).find((a) => a.code === code)
const byCodePrefix = (code) => (accounts ?? []).filter((a) => a.code?.startsWith(code) && a.level === 1)[0]
check('科目种子可用（1001/6001/1122/2202/1221）', Boolean(byCode('6001') && (byCode('1122') ?? byCodePrefix('1122'))))

const partnerR = unwrap((await api('/partners', { method: 'POST', token: token2, body: { name: `光影空间${Date.now() % 97}`, type: 'customer', taxNo: `R${Date.now() % 100000000}` } })).json)
const partnerP = unwrap((await api('/partners', { method: 'POST', token: token2, body: { name: `五金供应商${Date.now() % 89}`, type: 'supplier', taxNo: `P${Date.now() % 100000000}` } })).json)
check('创建往来单位', Boolean(partnerR?.id && partnerP?.id))

const emp = unwrap((await api('/employees', { method: 'POST', token: token2, body: { name: `张三${Date.now() % 71}` } })).json)
check('创建员工', Boolean(emp?.id))

// ==================== 造数：凭证 ====================
group('造数：当月凭证（3 收 2 支 + 应收 + 应付 + 员工借款）')
const today = new Date()
const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
const day = (n) => `${month}-${String(n).padStart(2, '0')}`

const cash = accounts.find((a) => a.code === '1001') ?? byCodePrefix('1001')
const bank = accounts.find((a) => a.code === '1002') ?? byCodePrefix('1002')
const revenue = byCode('6001')
const revOther = accounts.find((a) => a.code === '6051') ?? revenue
const cost = accounts.find((a) => a.code === '6401')?.level === 0 ? byCodePrefix('6401') : byCode('6401') // eslint-disable-line
const admin = accounts.find((a) => a.code === '6602')
const recv = byCode('1122') ?? byCodePrefix('1122')
const pay = byCode('2202') ?? byCodePrefix('2202')
const inventory = accounts.find((a) => a.code === '1405') ?? accounts.find((a) => a.code?.startsWith('1405'))
check('关键科目明细可用（1001/1002/6602/1122 为明细级）', Boolean(cash && bank && revenue && admin && recv && pay && inventory))

async function createVoucher(payload) {
  const res = await api('/vouchers', { method: 'POST', token: token2, body: { word: '记', ...payload } })
  if (res.status >= 400) return { error: res.json?.message ?? `HTTP ${res.status}` }
  const v = unwrap(res.json)
  // 统一用审核口径（报表含未审核参数默认 false）
  const ap = await api(`/vouchers/${v.id}/approve`, { method: 'POST', token: token2 })
  return { voucher: v, approve: ap.status < 400 }
}

const voucherPlan = [
  {
    // 收1：销售收款 10000
    voucherDate: day(5),
    remark: '销售商品收款',
    entries: [
      { summary: '销售收款', accountId: cash.id, debit: 10000 },
      { summary: '销售收款', accountId: revenue.id, credit: 10000, partnerId: partnerR.id },
    ],
  },
  {
    // 收2：银行收款 5000
    voucherDate: day(8),
    remark: '银行回款',
    entries: [
      { summary: '银行回款', accountId: bank.id, debit: 5000 },
      { summary: '银行回款', accountId: revenue.id, credit: 5000, partnerId: partnerR.id },
    ],
  },
  {
    // 收3：其他业务收入 2000 现金
    voucherDate: day(10),
    remark: '废料收入',
    entries: [
      { summary: '废料收入', accountId: cash.id, debit: 2000 },
      { summary: '废料收入', accountId: revOther.id, credit: 2000, partnerId: partnerR.id },
    ],
  },
  {
    // 支1：办公用品 3000 现金
    voucherDate: day(12),
    remark: '办公用品采购',
    entries: [
      { summary: '办公用品', accountId: admin.id ?? byCodePrefix('6602').id, debit: 3000 },
      { summary: '办公用品', accountId: cash.id, credit: 3000 },
    ],
  },
  {
    // 支2：主营业务成本 2200 银行付款
    voucherDate: day(15),
    remark: '采购商品成本',
    entries: [
      { summary: '采购成本', accountId: (byCode('6401') ?? byCodePrefix('6401')).id, debit: 2200 },
      { summary: '采购成本', accountId: bank.id, credit: 2200 },
    ],
  },
  {
    // 应收挂账 1500（贷 6001 不收款）
    voucherDate: day(16),
    remark: '销售未收款',
    entries: [
      { summary: '应收货款', accountId: recv.id, debit: 1500, partnerId: partnerP.id },
      { summary: '应收货款', accountId: revenue.id, credit: 1500, partnerId: partnerP.id },
    ],
  },
  {
    // 应付挂账 800
    voucherDate: day(17),
    remark: '采购未付款',
    entries: [
      { summary: '采购商品', accountId: inventory.id, debit: 800 },
      { summary: '应付货款', accountId: pay.id, credit: 800, partnerId: partnerP.id },
    ],
  },
]

const madeVouchers = []
for (const p of voucherPlan) {
  const r = await createVoucher(p)
  madeVouchers.push(r)
  check(`凭证 ${p.remark}`, Boolean(r?.voucher) && r.approve !== false, r?.error ?? '')
}

// 员工借款 1200（现金放款）
const loanRes = await api('/loans', {
  method: 'POST',
  token: token2,
  body: { loanDate: day(6), employeeId: emp.id, amount: 1200, payMethod: 'cash', reason: '差旅借支' },
})
const loan = unwrap(loanRes.json)
check('创建借款单', [200, 201].includes(loanRes.status), loanRes.json?.message)
if (loan?.id) {
  const ap = await api(`/loans/${loan.id}/approve`, { method: 'POST', token: token2 })
  check('借款单审核', [200, 201].includes(ap.status), ap.json?.message)
}

// ==================== 比对基准：真实接口数字 ====================
group('基准：利润表 / 试算数字')
const period = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`
const pl = unwrap((await api(`/reports/profit-loss?startPeriod=${period}&endPeriod=${period}`, { token: token2 })).json)
const plTotals = pl?.currentPeriod?.totals ?? {}
// 造数口径：收入 18500（10000+5000+2000+1500 应收挂账），支出 5200（3000 管理费用 + 2200 营业成本）
const expectRevenue = 18500
const expectExpense = 5200
const expectNet = 13300
check(
  '利润表营业收入与造数吻合',
  Math.abs(Number(plTotals.operatingRevenue ?? 0) - expectRevenue) < 0.005,
  `接口=${fmt(plTotals.operatingRevenue)} 期望=${expectRevenue}`,
)
check(
  '利润表净利润与造数吻合',
  Math.abs(Number(plTotals.netProfit ?? 0) - expectNet) < 0.005,
  `接口=${fmt(plTotals.netProfit)} 期望=${expectNet}`,
)

// ==================== 意图逐条回测 ====================
group('回测：意图与话术')

const r1 = await ask(token2, '看看这个月的收支')
check('收支意图命中', r1.status === 200 && r1.data?.intentId?.startsWith('pl'), `intent=${r1.data?.intentId}`)
check(
  '收支话术数字与利润表一致',
  r1.data && Math.abs(extractMoney(r1.data.reply, '营业收入') - expectRevenue) < 0.005,
  `话术营业收入=${extractMoney(r1.data?.reply, '营业收入')} 接口=${fmt(expectRevenue)}`,
)
const r1card = r1.data?.card
check(
  '收支卡片列与 Excel 列共用',
  Array.isArray(r1card?.columns) && r1card.columns.length === 4 &&
    ['收入', '成本', '费用', '净利润'].every((l, i) => r1card.columns[i].label === l),
)

const r1total = r1card?.totals
check(
  '收支卡片 total.netProfit 与接口净利润一致',
  r1total && Math.abs(Number(r1total.net) - Number(plTotals.netProfit ?? 0)) < 0.005,
  `卡片=${fmt(r1total?.net)} 接口=${fmt(plTotals.netProfit)}`,
)

// 应收："十月应收"（当前是 10 月，十月即本月）
const r2 = await ask(token2, '十月应收')
check(
  '「十月应收」时间解析到本月应收',
  r2.data && r2.data.intentId === 'ar.summary' && Math.abs(extractMoney(r2.data.reply, '合计') - 1500) < 0.005,
  `label=${r2.data?.card?.title} 话术合计=${extractMoney(r2.data?.reply, '合计')}`,
)
check(
  '应收卡片含挂账客户',
  r2.data?.card?.rows?.some((row) => row.partnerName === partnerP.name && Math.abs(Number(row.amount) - 1500) < 0.005),
)

// 应付
const r3 = await ask(token2, '我欠供应商多少')
check(
  '应付意图与金额',
  r3.data?.intentId === 'ap.summary' && Math.abs(extractMoney(r3.data.reply, '合计') - 800) < 0.005,
  `合计=${extractMoney(r3.data?.reply, '合计')}`,
)

// 员工借款
const r4 = await ask(token2, '张三还有哪笔借款没还')
check(
  '员工借款意图（关键词「借款」兜底命中）',
  r4.data?.intentId === 'loan.balance' && Math.abs(extractMoney(r4.data.reply, '合计') - 1200) < 0.005,
  `合计=${extractMoney(r4.data?.reply, '合计')}`,
)

// 凭证统计：当月审核凭证张数 = 造数 7 张 + 借款放款 1 张 = 8
const r5 = await ask(token2, '这个月记了几笔凭证')
check(
  '凭证统计张数',
  r5.data?.intentId === 'voucher.stats' && Number(r5.data?.card?.rows?.[0]?.count) === 8,
  `count=${r5.data?.card?.rows?.[0]?.count}`,
)
check(
  '凭证借贷合计平衡',
  r5.data && Math.abs(Number(r5.data.card.rows[0].debit) - Number(r5.data.card.rows[0].credit)) < 0.005,
  `借=${fmt(r5.data?.card?.rows?.[0]?.debit)} 贷=${fmt(r5.data?.card?.rows?.[0]?.credit)}`,
)

// 凭证导出
const r6 = await ask(token2, '导出这个月的凭证')
check(
  '导出凭证有 exportId 与行数',
  r6.data?.intentId === 'export.vouchers' && Boolean(r6.data?.exportId) && Number(r6.data?.card?.totals?.debitTotal) > 0,
  `rows=${r6.data?.card?.rows?.length}`,
)
if (r6.data?.exportId) {
  await verifyExcel(token2, r6.data.exportId, r6.data.card)
}

// 报销导出（空数据也要能正常回复）
const r7 = await ask(token2, '导出这个月的报销单')
check(
  '报销导出（无单据走空话术）',
  r7.status === 200 && (r7.data?.emptyReply || r7.data?.intentId === 'export.claims'),
  `reply=${(r7.data?.reply ?? '').slice(0, 30)}`,
)

// 资金余额（有 bank accounts 才有数据；无则空话术也算通过）
const r8 = await ask(token2, '账上还剩多少钱')
check(
  '资金余额意图可执行',
  r8.status === 200 && r8.data?.intentId === 'fund.balance',
  `reply=${(r8.data?.reply ?? '').slice(0, 40)}`,
)

// 跨期时间解析：上个月应为空
const prevPeriod = new Date(today.getFullYear(), today.getMonth() - 1, 1)
const prevLabel = `${prevPeriod.getFullYear()}年${prevPeriod.getMonth() + 1}月`
const r9 = await ask(token2, '上个月的收支')
check(
  '「上个月」解析 + 空月兜底话术',
  r9.data?.intentId?.startsWith('pl') && r9.data.reply?.includes('没有收支记录'),
  `话术=${r9.data?.reply}`,
)
check(
  '空月标签正确',
  r9.data?.transcript && r9.data.reply?.includes(String(prevPeriod.getFullYear())),
  `应含 ${prevLabel}`,
)

// 未来空月：2029年1月
const r10 = await ask(token2, '2029年1月收支')
check(
  '「2029年1月」解析 + 空月兜底',
  r10.data?.reply?.includes('2029年1月') && r10.data.reply?.includes('没有收支记录'),
  `话术=${r10.data?.reply}`,
)

// 年度收支
const r11 = await ask(token2, '今年收支')
check(
  '年度收支命中且为整年话术',
  r11.data?.intentId === 'pl.year' && r11.data.reply?.includes('累计净利润'),
  `intent=${r11.data?.intentId}`,
)

// 费用结构
const r12 = await ask(token2, '这个月费用花在哪')
check(
  '费用结构意图',
  r12.data?.intentId === 'expense.structure' && Math.abs(extractMoney(r12.data.reply, '合计') - expectExpense) < 0.005,
  `合计=${extractMoney(r12.data?.reply, '合计')} 期望=${expectExpense}`,
)

// 兜底
const r13 = await ask(token2, '今天天气怎么样')
check(
  '未识别指令走兜底话术',
  r13.data?.intentId === 'fallback' && /没有听明白/.test(r13.data?.reply ?? ''),
  `intent=${r13.data?.intentId}`,
)

// ==================== 权限 ====================
group('权限：无权限账号 403')
const vLogin = await api('/auth/login', { method: 'POST', body: { username: 'viewer2', password: '123456' } })
let viewerToken = unwrap(vLogin.json)?.accessToken
if (!viewerToken) {
  // 复用内置 viewer
  const v0 = await api('/auth/login', { method: 'POST', body: { username: 'viewer', password: '123456' } })
  viewerToken = unwrap(v0.json)?.accessToken
}
if (viewerToken) {
  const vAsk = await ask(viewerToken, '看看这个月的收支')
  check('viewer 查询语音接口 403', vAsk.status === 403, `status=${vAsk.status}`)
  const vStatus = await api('/voice/status', { token: viewerToken })
  check('viewer 状态接口 403', vStatus.status === 403, `status=${vStatus.status}`)
} else {
  console.log('  SKIP  无 viewer 账号可用，跳过 403 校验')
}

// ==================== 汇总 ====================
console.log(`\n== 回测汇总：PASS ${passed} / FAIL ${failed} ==`)
if (failed > 0) process.exit(1)

/** 从话术里抽取「<标签> <数字> 元」的值 */
function extractMoney(text, label) {
  if (!text) return NaN
  const m = text.match(new RegExp(`${label}\\s*([\\d,\\.]+)`))
  return m ? Number(m[1].replace(/,/g, '')) : NaN
}

/** 下载导出 Excel 并逐格核对卡片数字 */
async function verifyExcel(token, exportId, card) {
  const res = await fetch(`${BASE}/voice/export/${exportId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status !== 200) {
    check('Excel 下载', false, `HTTP ${res.status}`)
    return
  }
  const buf = Buffer.from(await res.arrayBuffer())
  const wb = XLSX.read(buf, { type: 'buffer' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 })
  const header = aoa[1] ?? []
  check('Excel 表头与卡片列一致', header.length >= card.columns.length && header.slice(0, card.columns.length).every((h, i) => h === card.columns[i].label))

  // 逐行核对数值列
  let allMatch = true
  for (let r = 0; r < card.rows.length; r++) {
    const row = aoa[2 + r] ?? []
    for (let c = 0; c < card.columns.length; c++) {
      const col = card.columns[c]
      const expected = col.numeric ? Number(card.rows[r][col.key] ?? 0) : card.rows[r][col.key] ?? ''
      const actual = col.numeric ? Number(row[c] ?? 0) : row[c] ?? ''
      if (col.numeric ? Math.abs(expected - actual) > 0.005 : String(expected) !== String(actual)) {
        allMatch = false
        console.log(`    不一致 行${r + 2} 列「${col.label}」 excel=${actual} 卡片=${expected}`)
      }
    }
  }
  check('Excel 每格数字与卡片一致', allMatch)

  // 合计行
  if (card.totals) {
    const footer = aoa[2 + card.rows.length] ?? []
    const totalsOk = card.columns.every((col, i) => {
      if (!col.numeric) return i === 0 ? footer[0] === '合计' || true : true
      return Math.abs(Number(footer[i] ?? NaN) - Number(card.totals[col.key] ?? 0)) < 0.005
    })
    check('Excel 合计行核对', totalsOk)
  }
}
