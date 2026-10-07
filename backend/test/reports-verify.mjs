/**
 * P18 报表增强验证：
 *  ledger / cash-flow / expense-analysis / monthly-close / overview
 *
 * 用法：node test/reports-verify.mjs [baseUrl]
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.argv[2] || 'http://127.0.0.1:3000/api'
const USERNAME = process.env.SMOKE_USERNAME || 'admin'
const PASSWORD = process.env.SMOKE_PASSWORD || '123456'

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(here, 'output')
fs.mkdirSync(outDir, { recursive: true })

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

/** 解包 { data: ... } 响应外层 */
function unwrap(body) {
  return body && typeof body === 'object' && 'data' in body ? body.data : body
}

console.log(`== P18 报表接口验证 base=${BASE} ==`)

// 1. 登录
const login = await api('/auth/login', {
  method: 'POST',
  body: { username: USERNAME, password: PASSWORD },
})
check('管理员登录', login.status === 201 || login.status === 200, `status=${login.status}`)
if (login.status !== 201 && login.status !== 200) {
  console.log('  登录失败，终止')
  process.exit(1)
}
const token = unwrap(login.json).accessToken

// 2. 票据台账
const ledger = await api('/reports/ledger?startPeriod=202401&endPeriod=202612', { token })
const ledgerData = unwrap(ledger.json)
check(
  'P18.1 票据台账',
  ledger.status === 200 && Array.isArray(ledgerData.rows) && ledgerData.summary?.count >= 0,
  `count=${ledgerData?.summary?.count ?? '-'} 张`,
)

// 3. 现金流量简表
const cashFlow = await api('/reports/cash-flow?startPeriod=202401&endPeriod=202612', { token })
const cashFlowData = unwrap(cashFlow.json)
check(
  'P18.2 现金流量简表',
  cashFlow.status === 200 && Array.isArray(cashFlowData.categories) && cashFlowData.categories.length === 3,
  `净增加额=${cashFlowData?.netIncrease ?? '-'}`,
)

// 4. 费用结构分析
const expense = await api('/reports/expense-analysis?startPeriod=202401&endPeriod=202612', { token })
const expenseData = unwrap(expense.json)
check(
  'P18.3 费用结构分析',
  expense.status === 200 &&
    Array.isArray(expenseData.byAccount) &&
    Array.isArray(expenseData.byPartner) &&
    Array.isArray(expenseData.rows),
  `费用总额=${expenseData?.total ?? '-'}`,
)

// 5. 一键月结
const close = await api('/reports/monthly-close?endPeriod=202612', { token })
const closeData = unwrap(close.json)
check(
  'P18.4 一键月结',
  close.status === 200 &&
    closeData.checks &&
    typeof closeData.ready === 'boolean' &&
    closeData.report?.balanceSheet &&
    closeData.report?.profitLoss &&
    closeData.report?.cashFlow &&
    closeData.report?.receiptSummary,
  `ready=${closeData?.ready ?? '-'} issues=${(closeData?.issues ?? []).length}`,
)

// 6. 经营看板
const overview = await api('/reports/overview?endPeriod=202612', { token })
const overviewData = unwrap(overview.json)
check(
  'P18.5 经营看板',
  overview.status === 200 &&
    overviewData.month &&
    overviewData.balance &&
    typeof overviewData.pendingReceipts === 'number',
  `收入=${overviewData?.month?.income ?? '-'}`,
)

// 7. 期间校验：起始 > 结束应报错
const bad = await api('/reports/ledger?startPeriod=202512&endPeriod=202401', { token })
check('P18 期间错误校验', bad.status === 400, `status=${bad.status}`)

console.log(`\n== 结果: ${passed} 通过, ${failed} 失败 ==`)
await new Promise((r) => setTimeout(r, 200))
process.exit(failed ? 1 : 0)
