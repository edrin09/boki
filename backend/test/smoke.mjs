/**
 * 后端冒烟测试（端到端）
 * 用法：先启动后端 `npm run start:dev` 或 `npm run start:prod`，再执行 `node test/smoke.mjs`
 */
const BASE = process.env.API_BASE || 'http://localhost:3000/api'

let pass = 0
let fail = 0
const failures = []

function ok(name, condition, detail = '') {
  if (condition) {
    pass += 1
    console.log(`  ✓ ${name}`)
  } else {
    fail += 1
    failures.push(name)
    console.log(`  ✗ ${name} ${detail}`)
  }
}

async function request(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    json = null
  }
  return { status: res.status, json }
}

function section(title) {
  console.log(`\n${title}`)
}

const main = async () => {
  console.log(`目标服务: ${BASE}\n${'='.repeat(60)}`)

  // ---------- 1. 认证 ----------
  section('1. 认证与权限')
  const login = await request('POST', '/auth/login', {
    body: { username: 'admin', password: '123456' },
  })
  ok('管理员登录成功', login.status === 200 && login.json?.code === 0, JSON.stringify(login.json))
  const token = login.json?.data?.accessToken
  if (!token) {
    console.error('\n登录失败，无法继续测试。请检查后端是否已启动。')
    process.exit(1)
  }
  ok('返回权限清单', Array.isArray(login.json?.data?.user?.permissions))

  const badLogin = await request('POST', '/auth/login', {
    body: { username: 'admin', password: 'wrong-password' },
  })
  ok('错误密码被拒绝', badLogin.status === 401)

  const noToken = await request('GET', '/accounts/tree')
  ok('未携带 Token 被拒绝', noToken.status === 401)

  // ---------- 2. 会计科目 ----------
  section('2. 会计科目')
  const tree = await request('GET', '/accounts/tree', { token })
  const accountList = await request('GET', '/accounts', { token })
  const accounts = accountList.json?.data ?? []
  ok('科目数量 >= 70', accounts.length >= 70, `实际 ${accounts.length}`)
  ok('科目树可加载', Array.isArray(tree.json?.data))
  ok('存在 1002 银行存款', accounts.some((a) => a.code === '1002'))
  ok('存在 6001 营业收入', accounts.some((a) => a.code === '6001'))
  ok('存在 1122 应收账款', accounts.some((a) => a.code === '1122'))

  const byCode = (code) => accounts.find((a) => a.code === code)

  // ---------- 3. 往来单位 ----------
  section('3. 往来单位')
  const stamp = Date.now().toString().slice(-6)
  const partner = await request('POST', '/partners', {
    token,
    body: { code: `C${stamp}`, name: `测试客户${stamp}`, type: 'customer' },
  })
  ok('新增客户成功', partner.status === 201 && partner.json?.data?.id, JSON.stringify(partner.json))
  const partnerId = partner.json?.data?.id

  const dupPartner = await request('POST', '/partners', {
    token,
    body: { code: `C${stamp}`, name: '重复编码' },
  })
  ok('重复编码被拒绝', dupPartner.status >= 400)

  // ---------- 4. 凭证：借贷平衡强校验 ----------
  section('4. 记账凭证与借贷平衡')
  const cash = byCode('1001')
  const revenue = byCode('6001')
  const interestExpense = byCode('6701.01')
  const date = new Date().toISOString().slice(0, 10)

  const onlyOneEntry = await request('POST', '/vouchers', {
    token,
    body: {
      word: '记',
      voucherDate: date,
      entries: [{ summary: '单边分录', accountId: cash.id, debit: 100 }],
    },
  })
  ok('单条分录被拒绝', onlyOneEntry.status >= 400, onlyOneEntry.json?.message)

  const unbalanced = await request('POST', '/vouchers', {
    token,
    body: {
      word: '记',
      voucherDate: date,
      entries: [
        { summary: '收入', accountId: cash.id, debit: 100 },
        { summary: '费用', accountId: interestExpense.id, credit: 80 },
      ],
    },
  })
  ok(
    '借贷不平衡被拒绝',
    unbalanced.status >= 400 && /不平衡/.test(unbalanced.json?.message ?? ''),
    unbalanced.json?.message,
  )

  const bothSides = await request('POST', '/vouchers', {
    token,
    body: {
      word: '记',
      voucherDate: date,
      entries: [
        { summary: '同时借贷', accountId: cash.id, debit: 100, credit: 100 },
        { summary: '对方', accountId: revenue.id, credit: 100 },
      ],
    },
  })
  ok('同一行同时有借贷被拒绝', bothSides.status >= 400, bothSides.json?.message)

  const nonLeaf = await request('POST', '/vouchers', {
    token,
    body: {
      word: '记',
      voucherDate: date,
      entries: [
        { summary: '父级科目', accountId: accounts.find((a) => a.code === '2211')?.id, debit: 100 },
        { summary: '对方', accountId: revenue.id, credit: 100 },
      ],
    },
  })
  ok('非明细科目记账被拒绝', nonLeaf.status >= 400, nonLeaf.json?.message)

  const missingAux = await request('POST', '/vouchers', {
    token,
    body: {
      word: '记',
      voucherDate: date,
      entries: [
        { summary: '应收未指定客户', accountId: byCode('1122').id, debit: 500 },
        { summary: '对方', accountId: revenue.id, credit: 500 },
      ],
    },
  })
  ok('辅助核算必填被拒绝', missingAux.status >= 400, missingAux.json?.message)

  // 正常凭证（草稿）
  const voucher = await request('POST', '/vouchers', {
    token,
    body: {
      word: '记',
      voucherDate: date,
      entries: [
        { summary: '销售商品收到现金', accountId: cash.id, debit: 1000 },
        { summary: '销售商品收到现金', accountId: revenue.id, credit: 1000, partnerId },
      ],
      remark: '冒烟测试凭证',
    },
  })
  ok('新增草稿凭证成功', voucher.status === 201, JSON.stringify(voucher.json))
  const voucherId = voucher.json?.data?.id
  ok('凭证借贷合计相等', voucher.json?.data?.debitTotal === voucher.json?.data?.creditTotal)
  ok('凭证初始为草稿', voucher.json?.data?.status === 'draft')
  ok('凭证号为 1', voucher.json?.data?.voucherNo === 1, `实际 ${voucher.json?.data?.voucherNo}`)

  const nextNo = await request('GET', `/vouchers/next-no?period=${voucher.json?.data?.period}&word=${encodeURIComponent('记')}`, { token })
  ok('下一凭证号递增为 2', nextNo.json?.data === 2, `实际 ${nextNo.json?.data}`)

  // 未审核不计入账簿
  const tbBefore = await request('GET', `/books/trial-balance?endPeriod=${voucher.json?.data?.period}`, { token })
  const rowBefore = (tbBefore.json?.data?.rows ?? []).find((r) => r.code === '1001')
  ok('未审核凭证不计入试算平衡表', !rowBefore, JSON.stringify(rowBefore))

  // 审核
  const approve = await request('POST', `/vouchers/${voucherId}/approve`, { token })
  ok('审核凭证成功', approve.status === 200 && approve.json?.data?.status === 'approved')

  const approveAgain = await request('POST', `/vouchers/${voucherId}/approve`, { token })
  ok('重复审核被拒绝', approveAgain.status >= 400)

  // ---------- 5. 账簿 ----------
  section('5. 账簿查询')
  const tbAfter = await request('GET', `/books/trial-balance?endPeriod=${voucher.json?.data?.period}`, { token })
  const cashRow = (tbAfter.json?.data?.rows ?? []).find((r) => r.code === '1001')
  ok('审核后计入试算平衡表', !!cashRow)
  ok('库存现金期末余额 1000', cashRow?.closingBalance === 1000, `实际 ${cashRow?.closingBalance}`)
  ok('试算平衡表借贷平衡', tbAfter.json?.data?.balanced === true, JSON.stringify(tbAfter.json?.data?.difference))

  const balance = await request('GET', `/books/balance?endPeriod=${voucher.json?.data?.period}`, { token })
  const balanceRows = balance.json?.data?.rows ?? []
  ok('科目余额表有数据', balanceRows.length > 0)
  ok(
    '会计恒等式成立：资产 = 负债 + 所有者权益 + 损益',
    (() => {
      const sumBy = (category, sign) =>
        balanceRows
          .filter((r) => r.level === 1 && r.category === category)
          .reduce((acc, r) => acc + sign * (r.closingDebit - r.closingCredit), 0)
      const asset = sumBy('asset', 1)
      const liability = sumBy('liability', -1)
      const equity = sumBy('equity', -1)
      const profit = sumBy('profit', -1)
      return Math.abs(asset - (liability + equity + profit)) < 0.01
    })(),
  )

  const ledger = await request('GET', `/books/ledger?accountId=${cash.id}&endPeriod=${voucher.json?.data?.period}`, { token })
  ok('总账返回分录行', (ledger.json?.data?.rows ?? []).length === 1)
  ok('总账余额正确', ledger.json?.data?.summary?.closingBalance === 1000)

  const subLedger = await request('GET', `/books/sub-ledger?accountId=${revenue.id}&endPeriod=${voucher.json?.data?.period}`, { token })
  ok('明细账按辅助核算分组', (subLedger.json?.data?.groups ?? []).length >= 1)

  // ---------- 6. 审核控制 ----------
  section('6. 审核控制')
  const editApproved = await request('PUT', `/vouchers/${voucherId}`, {
    token,
    body: {
      word: '记',
      voucherDate: date,
      entries: [
        { summary: '改', accountId: cash.id, debit: 2000 },
        { summary: '改', accountId: revenue.id, credit: 2000, partnerId },
      ],
    },
  })
  ok('已审核凭证禁止修改', editApproved.status >= 400, editApproved.json?.message)

  const deleteApproved = await request('DELETE', `/vouchers/${voucherId}`, { token })
  ok('已审核凭证禁止删除', deleteApproved.status >= 400, deleteApproved.json?.message)

  const unapprove = await request('POST', `/vouchers/${voucherId}/unapprove`, { token })
  ok('反审核成功', unapprove.status === 200 && unapprove.json?.data?.status === 'draft')

  const tbAfterUnapprove = await request('GET', `/books/trial-balance?endPeriod=${voucher.json?.data?.period}`, { token })
  ok(
    '反审核后不再计入账簿',
    !(tbAfterUnapprove.json?.data?.rows ?? []).some((r) => r.code === '1001'),
  )

  const deleted = await request('DELETE', `/vouchers/${voucherId}`, { token })
  ok('草稿凭证可删除', deleted.status === 200)

  // ---------- 7. 科目保护 ----------
  section('7. 基础档案约束')
  const delParent = await request('DELETE', `/accounts/${accounts.find((a) => a.code === '2211')?.id}`, { token })
  ok('存在下级的科目不可删除', delParent.status >= 400, delParent.json?.message)

  const delPartner = await request('DELETE', `/partners/${partnerId}`, { token })
  ok('未引用的往来单位可删除', delPartner.status === 200)

  // ---------- 8. 越权校验 ----------
  section('8. RBAC 越权拦截')
  const viewerLogin = await request('POST', '/auth/login', {
    body: { username: 'viewer', password: '123456' },
  })
  const viewerToken = viewerLogin.json?.data?.accessToken
  ok('查看员登录成功', !!viewerToken)

  const viewerCreate = await request('POST', '/vouchers', {
    token: viewerToken,
    body: {
      word: '记',
      voucherDate: date,
      entries: [
        { summary: 'x', accountId: cash.id, debit: 1 },
        { summary: 'x', accountId: revenue.id, credit: 1 },
      ],
    },
  })
  ok('查看员新增凭证被拒绝(403)', viewerCreate.status === 403, `实际 ${viewerCreate.status}`)

  const viewerLedger = await request('GET', `/books/trial-balance?endPeriod=${voucher.json?.data?.period}`, {
    token: viewerToken,
  })
  ok('查看员可查试算平衡表', viewerLedger.status === 200)

  // ---------- 汇总 ----------
  console.log(`\n${'='.repeat(60)}`)
  console.log(`通过 ${pass} 项，失败 ${fail} 项`)
  if (fail > 0) {
    console.log('失败用例：')
    failures.forEach((f) => console.log(`  - ${f}`))
    process.exit(1)
  }
  console.log('全部通过 ✅')
}

main().catch((err) => {
  console.error('\n测试执行异常:', err)
  process.exit(1)
})