/**
 * 后端冒烟测试 2：报表、资金往来、系统管理
 * 用法：先启动后端，再执行 `node test/smoke2.mjs`
 */
const BASE = process.env.API_BASE || 'http://localhost:3000/api'

let pass = 0
let fail = 0
const failures = []

function ok(name, condition, detail = '') {
  if (condition) {
    pass += 1
    console.log(`  OK  ${name}`)
  } else {
    fail += 1
    failures.push(name)
    console.log(`  NG  ${name} ${detail}`)
  }
}

async function request(method, path, { token, body, raw } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (raw) return { status: res.status, text: await res.text() }
  let json = null
  try {
    json = await res.json()
  } catch {
    json = null
  }
  return { status: res.status, json }
}

const section = (t) => console.log(`\n${t}`)
const money = (v) => Math.round((Number(v) || 0) * 100) / 100

const main = async () => {
  console.log(`目标服务: ${BASE}\n${'='.repeat(60)}`)

  const login = await request('POST', '/auth/login', {
    body: { username: 'admin', password: '123456' },
  })
  const token = login.json?.data?.accessToken
  ok('管理员登录', !!token)
  if (!token) process.exit(1)

  // 本脚本依赖全新的数据库，检测到历史业务数据时直接退出，避免累加导致断言失真
  const dash0 = await request('GET', '/system/dashboard', { token })
  const existingVouchers = dash0.json?.data?.voucherCount ?? 0
  if (existingVouchers > 0) {
    console.log(
      `\n检测到已有 ${existingVouchers} 张凭证。本测试需在全新数据库上运行。\n` +
        `请先执行: npm run db:reset -- --yes  然后重启后端。`,
    )
    process.exit(1)
  }

  const accounts = (await request('GET', '/accounts', { token })).json?.data ?? []
  const byCode = (c) => accounts.find((a) => a.code === c)
  const period = new Date().toISOString().slice(0, 7).replace('-', '')
  const date = new Date().toISOString().slice(0, 10)

  // ---------- 基础档案准备 ----------
  section('0. 基础数据准备')
  const stamp = Date.now().toString().slice(-6)
  const customer = await request('POST', '/partners', {
    token,
    body: { code: `AR${stamp}`, name: `应收客户${stamp}`, type: 'customer' },
  })
  ok('创建客户', customer.status === 201, JSON.stringify(customer.json))
  const supplier = await request('POST', '/partners', {
    token,
    body: { code: `AP${stamp}`, name: `应付供应商${stamp}`, type: 'supplier' },
  })
  ok('创建供应商', supplier.status === 201)
  const dept = await request('POST', '/departments', {
    token,
    body: { code: `D${stamp}`, name: `测试部门${stamp}` },
  })
  ok('创建部门', dept.status === 201)

  const cashBank = await request('POST', '/banks', {
    token,
    body: { code: `B${stamp}`, name: `基本户${stamp}`, type: 'bank', accountCode: '1002', bankName: '测试银行' },
  })
  ok('创建银行账户(关联1002)', cashBank.status === 201, JSON.stringify(cashBank.json))

  const badBank = await request('POST', '/banks', {
    token,
    body: { code: `BX${stamp}`, name: '未关联科目', type: 'bank' },
  })
  ok('资金账户可不关联科目', badBank.status === 201)

  // ---------- 期初余额 ----------
  section('1. 期初余额')
  const arAccount = byCode('1122')
  const apAccount = byCode('2202')
  const cash = byCode('1001')
  const equity = byCode('3001')

  const ib1 = await request('POST', '/initial-balances', {
    token,
    body: {
      fiscalYear: Number(period.slice(0, 4)),
      accountId: arAccount.id,
      partnerId: customer.json.data.id,
      direction: 'debit',
      amount: 50000,
    },
  })
  ok('录入应收期初 50000', ib1.status === 201, JSON.stringify(ib1.json))

  const ib2 = await request('POST', '/initial-balances', {
    token,
    body: {
      fiscalYear: Number(period.slice(0, 4)),
      accountId: apAccount.id,
      partnerId: supplier.json.data.id,
      direction: 'credit',
      amount: 20000,
    },
  })
  ok('录入应付期初 20000', ib2.status === 201)

  const ib3 = await request('POST', '/initial-balances', {
    token,
    body: {
      fiscalYear: Number(period.slice(0, 4)),
      accountId: cash.id,
      direction: 'debit',
      amount: 30000,
    },
  })
  ok('录入现金期初 30000', ib3.status === 201)

  const ib4 = await request('POST', '/initial-balances', {
    token,
    body: {
      fiscalYear: Number(period.slice(0, 4)),
      accountId: equity.id,
      direction: 'credit',
      amount: 60000,
    },
  })
  ok('录入实收资本期初 60000（借贷平衡）', ib4.status === 201)

  // 同一组合重复录入应更新而非新增
  // 同一组合重复录入应更新而非新增
  const ibDup = await request('POST', '/initial-balances', {
    token,
    body: {
      fiscalYear: Number(period.slice(0, 4)),
      accountId: cash.id,
      direction: 'debit',
      amount: 30000,
      remark: '同组合重复录入应更新',
    },
  })
  ok('同组合重复录入更新原记录', ibDup.status === 201)

  const missingAux = await request('POST', '/initial-balances', {
    token,
    body: {
      fiscalYear: Number(period.slice(0, 4)),
      accountId: arAccount.id,
      direction: 'debit',
      amount: 100,
    },
  })
  ok('期初缺辅助核算被拒绝', missingAux.status >= 400, missingAux.json?.message)

  const check = await request(
    'GET',
    `/initial-balances/check?fiscalYear=${period.slice(0, 4)}`,
    { token },
  )
  ok('期初试算平衡', check.json?.data?.balanced === true, JSON.stringify(check.json?.data))

  // ---------- 报表 ----------
  section('2. 财务报表')
  const fy = Number(period.slice(0, 4))

  const bs = await request('GET', `/reports/balance-sheet?endPeriod=${period}&fiscalYear=${fy}`, { token })
  const bsData = bs.json?.data
  ok('资产负债表可生成', bs.status === 200 && !!bsData)
  ok('资产总计 = 30000+50000 = 80000', money(bsData?.totals?.totalAssets) === 80000, `实际 ${bsData?.totals?.totalAssets}`)
  ok('负债总计 = 20000', money(bsData?.totals?.totalLiabilities) === 20000, `实际 ${bsData?.totals?.totalLiabilities}`)
  ok('权益总计 = 60000', money(bsData?.totals?.totalEquity) === 60000, `实际 ${bsData?.totals?.totalEquity}`)
  ok('资产 = 负债 + 权益（平衡）', bsData?.balanced === true, `差额 ${bsData?.difference}`)

  const pl0 = await request('GET', `/reports/profit-loss?endPeriod=${period}&fiscalYear=${fy}`, { token })
  ok('利润表可生成', pl0.status === 200)
  ok('无业务时净利润为 0', money(pl0.json?.data?.yearToDate?.totals?.netProfit) === 0, `实际 ${pl0.json?.data?.yearToDate?.totals?.netProfit}`)

  // ---------- 现金银行 ----------
  section('3. 现金银行单据')
  const revenue = byCode('6001')
  const officeExpense = byCode('6602')

  const receipt = await request('POST', '/cash-bank', {
    token,
    body: {
      bizType: 'receipt',
      bizDate: date,
      bankAccountId: cashBank.json.data.id,
      accountId: arAccount.id,
      partnerId: customer.json.data.id,
      amount: 15000,
      summary: '收到货款',
    },
  })
  ok('新增收款单（生成已审核凭证）', receipt.status === 201, JSON.stringify(receipt.json))
  ok('收款单关联凭证', !!receipt.json?.data?.voucherId)

  const noCounter = await request('POST', '/cash-bank', {
    token,
    body: {
      bizType: 'receipt',
      bizDate: date,
      bankAccountId: cashBank.json.data.id,
      amount: 100,
    },
  })
  ok('缺对方科目被拒绝', noCounter.status >= 400, noCounter.json?.message)

  const sameTransfer = await request('POST', '/cash-bank', {
    token,
    body: {
      bizType: 'transfer',
      bizDate: date,
      bankAccountId: cashBank.json.data.id,
      toBankAccountId: cashBank.json.data.id,
      amount: 100,
    },
  })
  ok('转入转出相同账户被拒绝', sameTransfer.status >= 400, sameTransfer.json?.message)

  const transfer = await request('POST', '/cash-bank', {
    token,
    body: {
      bizType: 'transfer',
      bizDate: date,
      bankAccountId: cashBank.json.data.id,
      toBankAccountId: cashBank.json.data.id === badBank.json.data.id ? cashBank.json.data.id : badBank.json.data.id,
      amount: 100,
    },
  })
  // badBank 未关联科目，应报错
  ok('转入账户未关联科目被拒绝', transfer.status >= 400, transfer.json?.message)

  const expense = await request('POST', '/cash-bank', {
    token,
    body: {
      bizType: 'expense',
      bizDate: date,
      bankAccountId: cashBank.json.data.id,
      accountId: officeExpense.id,
      departmentId: dept.json.data.id,
      amount: 3000,
      summary: '办公费报销',
    },
  })
  ok('新增费用报销单', expense.status === 201, JSON.stringify(expense.json))

  // ---------- 其他收支 ----------
  section('4. 其他收支')
  const otherIncome = byCode('6201')
  const nonOpExpense = byCode('6801')

  const inc = await request('POST', '/income-expense', {
    token,
    body: {
      bizType: 'income',
      bizDate: date,
      accountId: otherIncome.id,
      bankAccountId: cashBank.json.data.id,
      amount: 2000,
      summary: '补贴收入',
    },
  })
  ok('新增其他收入单', inc.status === 201, JSON.stringify(inc.json))

  const exp = await request('POST', '/income-expense', {
    token,
    body: {
      bizType: 'expense',
      bizDate: date,
      accountId: nonOpExpense.id,
      bankAccountId: cashBank.json.data.id,
      amount: 500,
      summary: '捐赠支出',
    },
  })
  ok('新增其他支出单', exp.status === 201, JSON.stringify(exp.json))

  // ---------- 往来核销 ----------
  section('5. 应收应付与核销')
  const arBefore = await request('GET', `/ar-ap/receivable?endPeriod=${period}&fiscalYear=${fy}`, { token })
  const arRow = (arBefore.json?.data?.rows ?? []).find((r) => r.partnerId === customer.json.data.id)
  ok('应收余额可查', !!arRow, JSON.stringify(arBefore.json?.data?.rows))
  ok('收款后期初应收 50000 变为 35000', money(arRow?.closingBalance) === 35000, `实际 ${arRow?.closingBalance}`)

  const wo = await request('POST', '/ar-ap/write-off', {
    token,
    body: {
      type: 'receivable',
      partnerId: customer.json.data.id,
      bizDate: date,
      bankAccountId: cashBank.json.data.id,
      amount: 15000,
    },
  })
  ok('执行应收核销', wo.status === 201, JSON.stringify(wo.json))

  const arAfter = await request('GET', `/ar-ap/receivable?endPeriod=${period}&fiscalYear=${fy}`, { token })
  const arRow2 = (arAfter.json?.data?.rows ?? []).find((r) => r.partnerId === customer.json.data.id)
  ok('核销后应收再减少 15000', money(arRow2?.closingBalance) === 20000, `实际 ${arRow2?.closingBalance}`)

  const woRevoke = await request('DELETE', `/ar-ap/write-off/${wo.json.data.id}`, { token })
  ok('撤销核销', woRevoke.status === 200, JSON.stringify(woRevoke.json))

  const arFinal = await request('GET', `/ar-ap/receivable?endPeriod=${period}&fiscalYear=${fy}`, { token })
  const arRow3 = (arFinal.json?.data?.rows ?? []).find((r) => r.partnerId === customer.json.data.id)
  ok('撤销后应收恢复 35000', money(arRow3?.closingBalance) === 35000, `实际 ${arRow3?.closingBalance}`)

  const payableList = await request('GET', `/ar-ap/payable?endPeriod=${period}&fiscalYear=${fy}`, { token })
  ok('应付余额可查', (payableList.json?.data?.rows ?? []).length >= 1)

  // ---------- 利润表（此时应有数据） ----------
  section('6. 报表复核')
  const pl = await request('GET', `/reports/profit-loss?endPeriod=${period}&fiscalYear=${fy}`, { token })
  const plData = pl.json?.data
  ok('利润表本期可生成', pl.status === 200)
  ok('费用合计 = 3500（管理费用3000+营业外支出500）',
    money(plData?.currentPeriod?.totals?.adminExpense) === 3000 &&
      money(plData?.currentPeriod?.totals?.nonOperatingExpense) === 500,
    `admin=${plData?.currentPeriod?.totals?.adminExpense} nonOp=${plData?.currentPeriod?.totals?.nonOperatingExpense}`)
  ok('营业外收入 2000', money(plData?.yearToDate?.totals?.nonOperatingIncome) === 2000,
    `实际 ${plData?.yearToDate?.totals?.nonOperatingIncome}`)
  ok('净利润 = 2000 - 3000 - 500 = -1500', money(plData?.yearToDate?.totals?.netProfit) === -1500,
    `实际 ${plData?.yearToDate?.totals?.netProfit}`)

  const tb = await request('GET', `/books/trial-balance?endPeriod=${period}&fiscalYear=${fy}`, { token })
  ok('试算平衡表借贷平衡', tb.json?.data?.balanced === true, `差额 ${tb.json?.data?.difference}`)

  // 未做期末结转损益时，资产与「负债+权益」的差额应等于当期损益净额
  const bs2 = await request('GET', `/reports/balance-sheet?endPeriod=${period}&fiscalYear=${fy}`, { token })
  const netProfit = plData?.yearToDate?.totals?.netProfit ?? 0
  ok('未结转损益时差额 = 净利润（会计恒等式）',
    money(bs2.json?.data?.difference) === money(Math.abs(netProfit)),
    `差额 ${bs2.json?.data?.difference} 净利润 ${netProfit}`)

  // ---------- 单据与凭证联动 ----------
  section('7. 单据与凭证联动')
  const delCash = await request('DELETE', `/cash-bank/${receipt.json.data.id}`, { token })
  ok('删除收款单（同时删除凭证）', delCash.status === 200, JSON.stringify(delCash.json))

  const voucherLeft = await request('GET', `/vouchers?accountId=${arAccount.id}&endPeriod=${period}`, { token })
  const sourceVouchers = (voucherLeft.json?.data?.list ?? []).filter(
    (v) => v.sourceType === 'cash_bank',
  )
  ok('关联凭证已同步删除', sourceVouchers.length === 0, `剩余 ${sourceVouchers.length}`)

  // ---------- 系统管理 ----------
  section('8. 系统管理')
  const dash = await request('GET', '/system/dashboard', { token })
  ok('工作台统计可查', dash.status === 200 && typeof dash.json?.data?.voucherCount === 'number')

  const info = await request('GET', '/system/info', { token })
  ok('系统信息可查', info.status === 200 && !!info.json?.data?.database?.sizeText)

  const logs = await request('GET', '/system/logs?pageSize=10', { token })
  ok('操作日志已记录', (logs.json?.data?.total ?? 0) > 0, `total=${logs.json?.data?.total}`)

  const backup = await request('POST', '/system/backups', { token })
  ok('创建备份成功', backup.status === 201 && !!backup.json?.data?.filename, JSON.stringify(backup.json))

  const backupList = await request('GET', '/system/backups', { token })
  ok('备份列表可见', (backupList.json?.data ?? []).length >= 1)

  const dl = await request('GET', `/system/backups/download?filename=${backup.json.data.filename}`, {
    token,
    raw: true,
  })
  ok('备份可下载', dl.status === 200 && dl.text.length > 0)

  const cashierLogin = await request('POST', '/auth/login', {
    body: { username: 'cashier', password: '123456' },
  })
  ok('出纳登录', !!cashierLogin.json?.data?.accessToken)
  const cashierToken = cashierLogin.json?.data?.accessToken
  const backupDenied = await request('GET', '/system/info', { token: cashierToken })
  ok('出纳访问系统信息被拒绝(403)', backupDenied.status === 403, `实际 ${backupDenied.status}`)

  const restore = await request('POST', '/system/backups/restore', {
    token,
    body: { filename: backup.json.data.filename, confirm: true },
  })
  ok('从备份恢复成功', restore.status === 200, JSON.stringify(restore.json))

  const rmBackup = await request('DELETE', `/system/backups/${backup.json.data.filename}`, { token })
  ok('删除备份文件', rmBackup.status === 200)

  // ---------- 汇总 ----------
  console.log(`\n${'='.repeat(60)}`)
  console.log(`通过 ${pass} 项，失败 ${fail} 项`)
  if (fail > 0) {
    console.log('失败用例：')
    failures.forEach((f) => console.log(`  - ${f}`))
    process.exit(1)
  }
  console.log('全部通过')
}

main().catch((err) => {
  console.error('\n测试执行异常:', err)
  process.exit(1)
})