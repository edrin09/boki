/**
 * 冒烟测试 3：员工 / 报销单 / 工资表 / 凭证红冲 / 凭证复制
 * 用法：全新数据库启动后端后执行 `node test/smoke3.mjs`
 */
const BASE = process.env.API_BASE || 'http://localhost:3000/api'

let pass = 0
let fail = 0
const failures = []

function ok(name, cond, detail = '') {
  if (cond) {
    pass += 1
    console.log(`  OK  ${name}`)
  } else {
    fail += 1
    failures.push(name)
    console.log(`  NG  ${name} ${detail}`)
  }
}

const j = async (m, p, t, b) => {
  const res = await fetch(BASE + p, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
    body: b ? JSON.stringify(b) : undefined,
  })
  try {
    return await res.json()
  } catch {
    return null
  }
}

const section = (t) => console.log(`\n${t}`)
const today = () => new Date().toISOString().slice(0, 10)
const period = () => new Date().toISOString().slice(0, 7).replace('-', '')

const main = async () => {
  console.log(`目标服务: ${BASE}\n${'='.repeat(60)}`)

  const login = await j('POST', '/auth/login', null, { username: 'admin', password: '123456' })
  const t = login?.data?.accessToken
  ok('管理员登录', !!t)
  if (!t) process.exit(1)

  const dash = await j('GET', '/system/dashboard', t)
  if ((dash?.data?.voucherCount ?? 0) > 0) {
    console.log('\n检测到已有凭证，本测试需在全新数据库上运行。请先 npm run db:reset -- --yes 后重启。')
    process.exit(1)
  }

  const accounts = (await j('GET', '/accounts', t))?.data ?? []
  const acc = (code) => accounts.find((a) => a.code === code)
  const cash = acc('1001')

  // ================= 1. 员工管理 =================
  section('1. 员工管理')
  const empOpts0 = await j('GET', '/employees/options', t)
  ok('员工下拉可查（初始为空）', Array.isArray(empOpts0?.data), JSON.stringify(empOpts0))

  const dept = await j('POST', '/departments', t, { code: `D${Date.now().toString().slice(-6)}`, name: '财务部' })
  const deptId = dept?.data?.id

  const e1 = await j('POST', '/employees', t, {
    code: 'E001', name: '张三', gender: 'male', departmentId: deptId,
    position: '会计', baseSalary: 8000, phone: '13800000001',
  })
  ok('新增员工', e1?.code === 0, JSON.stringify(e1))
  const emp1 = e1?.data?.id

  const e2 = await j('POST', '/employees', t, {
    code: 'E002', name: '李四', gender: 'female', position: '出纳', baseSalary: 6000,
  })
  ok('新增员工2', e2?.code === 0)

  const dup = await j('POST', '/employees', t, { code: 'E001', name: '重复工号' })
  ok('重复工号被拒绝', dup?.code >= 400)

  const list = await j('GET', '/employees', t)
  ok('员工列表含部门名', list?.data?.list?.[0]?.departmentName === '财务部',
    JSON.stringify(list?.data?.list?.[0]?.departmentName))

  const opts = await j('GET', '/employees/options', t)
  ok('在职员工下拉 2 人', (opts?.data ?? []).length === 2, `实际 ${(opts?.data ?? []).length}`)

  // ================= 2. 财务报销单 =================
  section('2. 财务报销单')
  const claimNo = await j('GET', '/expense-claims/next-no', t)
  ok('生成报销单号', /^BX\d{8}$/.test(claimNo?.data ?? ''), claimNo?.data)

  const claim = await j('POST', '/expense-claims', t, {
    claimDate: today(),
    employeeId: emp1,
    payMethod: 'cash',
    items: [
      { summary: '差旅费', accountId: acc('6602').id, amount: 1200 },
      { summary: '办公用品', amount: 300 },
    ],
    remark: '冒烟测试报销',
  })
  ok('新增报销单(草稿)', claim?.code === 0, JSON.stringify(claim))
  const claimId = claim?.data?.id
  ok('报销单金额合计 1500', claim?.data?.totalAmount === 1500, `实际 ${claim?.data?.totalAmount}`)
  ok('报销单初始为草稿', claim?.data?.status === 'draft')

  const emptyItems = await j('POST', '/expense-claims', t, {
    claimDate: today(), employeeId: emp1, payMethod: 'cash', items: [{ summary: 'x', amount: 0 }],
  })
  ok('金额为0被拒绝', emptyItems?.code >= 400, emptyItems?.message)

  const appr = await j('POST', `/expense-claims/${claimId}/approve`, t)
  ok('审核报销单成功', appr?.code === 0, JSON.stringify(appr))
  ok('审核后状态=已审核', appr?.data?.status === 'approved')
  ok('审核生成记账凭证', !!appr?.data?.voucherId)

  const doubleApprove = await j('POST', `/expense-claims/${claimId}/approve`, t)
  ok('重复审核被拒绝', doubleApprove?.code >= 400)

  const paid = await j('POST', `/expense-claims/${claimId}/pay`, t, {})
  ok('报销付款成功', paid?.code === 0, JSON.stringify(paid))
  ok('付款后状态=已付款', paid?.data?.status === 'paid')
  ok('付款生成付款凭证', !!paid?.data?.payVoucherId)

  const delPaid = await j('DELETE', `/expense-claims/${claimId}`, t)
  ok('已付款报销单不可删除', delPaid?.code >= 400, delPaid?.message)

  // 垫付方式
  const claim2 = await j('POST', '/expense-claims', t, {
    claimDate: today(), employeeId: emp2(claim), payMethod: 'advance',
    items: [{ summary: '垫付', amount: 500 }],
  })
  ok('垫付模式报销单', claim2?.code === 0, JSON.stringify(claim2))
  const claim2Id = claim2?.data?.id
  const appr2 = await j('POST', `/expense-claims/${claim2Id}/approve`, t)
  ok('垫付报销审核成功', appr2?.code === 0, JSON.stringify(appr2))
  const pay2 = await j('POST', `/expense-claims/${claim2Id}/pay`, t, {})
  ok('垫付模式不允许在此付款', pay2?.code >= 400, pay2?.message)

  function emp2() {
    return e2?.data?.id
  }

  // ================= 3. 工资表 =================
  section('3. 工资表')
  const gen = await j('POST', '/payrolls/generate', t, {
    period: Number(period()), payDate: today(),
  })
  ok('按在职员工生成工资单', gen?.code === 0, JSON.stringify(gen))
  const payrollId = gen?.data?.id
  ok('工资单含 2 名员工', gen?.data?.employeeCount === 2, `实际 ${gen?.data?.employeeCount}`)
  ok('应发合计 = 8000+6000 = 14000', gen?.data?.totalGross === 14000, `实际 ${gen?.data?.totalGross}`)
  ok('实发合计 = 14000', gen?.data?.totalNet === 14000, `实际 ${gen?.data?.totalNet}`)

  const dupPeriod = await j('POST', '/payrolls/generate', t, {
    period: Number(period()), payDate: today(),
  })
  ok('同期间重复生成被拒绝', dupPeriod?.code >= 400, dupPeriod?.message)

  // 编辑明细：加社保/公积金/个税
  const detail = await j('GET', `/payrolls/${payrollId}`, t)
  const items = detail?.data?.items ?? []
  items[0].insurancePersonal = 800
  items[0].fundPersonal = 400
  items[0].tax = 120
  items[0].performance = 1000
  const upd = await j('PUT', `/payrolls/${payrollId}`, t, {
    period: Number(period()),
    payDate: detail?.data?.payDate,
    items: items.map((i) => ({
      employeeId: i.employeeId,
      baseSalary: Number(i.baseSalary),
      performance: Number(i.performance),
      allowance: Number(i.allowance),
      overtime: Number(i.overtime),
      insurancePersonal: Number(i.insurancePersonal),
      fundPersonal: Number(i.fundPersonal),
      tax: Number(i.tax),
      otherDeduct: Number(i.otherDeduct),
    })),
  })
  ok('编辑工资明细成功', upd?.code === 0, JSON.stringify(upd))
  ok('应发合计 = 15000（+绩效1000）', upd?.data?.totalGross === 15000, `实际 ${upd?.data?.totalGross}`)
  ok('实发合计 = 15000-1320 = 13680', upd?.data?.totalNet === 13680, `实际 ${upd?.data?.totalNet}`)

  const overDeduct = await j('PUT', `/payrolls/${payrollId}`, t, {
    period: Number(period()),
    payDate: upd?.data?.payDate,
    items: [{ employeeId: items[0].employeeId, baseSalary: 1000, tax: 5000 }],
  })
  ok('代扣超过应发被拒绝', overDeduct?.code >= 400, overDeduct?.message)

  const pappr = await j('POST', `/payrolls/${payrollId}/approve`, t)
  ok('审核(计提)成功', pappr?.code === 0, JSON.stringify(pappr))
  ok('计提生成凭证', !!pappr?.data?.voucherId)

  const ppay = await j('POST', `/payrolls/${payrollId}/pay`, t, {})
  ok('发放工资成功', ppay?.code === 0, JSON.stringify(ppay))
  ok('发放后状态=已发放', ppay?.data?.status === 'paid')
  ok('发放生成凭证', !!ppay?.data?.payVoucherId)

  const delPayroll = await j('DELETE', `/payrolls/${payrollId}`, t)
  ok('已发放工资单不可删除', delPayroll?.code >= 400, delPayroll?.message)

  // ================= 4. 试算平衡校验 =================
  section('4. 全流程账务平衡校验')
  const tb = await j('GET', `/books/trial-balance?endPeriod=${period()}&fiscalYear=${new Date().getFullYear()}`, t)
  ok('试算平衡表借贷平衡', tb?.data?.balanced === true, `差额 ${tb?.data?.difference}`)

  // ================= 5. 凭证复制 =================
  section('5. 凭证复制')
  const voucherList = await j('GET', '/vouchers', t)
  const anyVoucher = voucherList?.data?.list?.[0]
  ok('存在凭证可复制', !!anyVoucher)

  const cp = await j('GET', `/vouchers/${anyVoucher.id}/copy`, t)
  ok('复制接口返回草稿数据', cp?.code === 0 && Array.isArray(cp?.data?.entries), JSON.stringify(cp?.code))
  ok('复制分录条数一致', (cp?.data?.entries ?? []).length === (anyVoucher?.entries ?? []).length,
    `${(cp?.data?.entries ?? []).length} vs ${(anyVoucher?.entries ?? []).length}`)
  ok('复制不携带原凭证ID', cp?.data?.id === undefined)

  // ================= 6. 凭证红冲 =================
  section('6. 凭证红冲')
  const draft = await j('POST', '/vouchers', t, {
    word: '记', voucherDate: today(),
    entries: [
      { summary: '红冲测试', accountId: cash.id, debit: 888 },
      { summary: '红冲测试', accountId: acc('3001').id, credit: 888 },
    ],
  })
  ok('创建草稿凭证', draft?.code === 0, JSON.stringify(draft))

  const revDraft = await j('POST', `/vouchers/${draft.data.id}/reverse`, t, { reason: '测试' })
  ok('草稿凭证不可红冲', revDraft?.code >= 400, revDraft?.message)

  await j('POST', `/vouchers/${draft.data.id}/approve`, t)
  const rev = await j('POST', `/vouchers/${draft.data.id}/reverse`, t, { reason: '金额录错' })
  ok('红冲成功', rev?.code === 0, JSON.stringify(rev))
  const revId = rev?.data?.reversal?.id
  ok('红冲凭证标记 isReversal', rev?.data?.reversal?.isReversal === true)
  ok('红冲凭证关联原凭证', rev?.data?.reversal?.reversalOfId === draft.data.id)
  ok('原凭证记录红冲凭证ID', rev?.data?.original?.reversedById === revId)

  const revDetail = await j('GET', `/vouchers/${revId}`, t)
  const origDetail = await j('GET', `/vouchers/${draft.data.id}`, t)
  const origEntry = (origDetail?.data?.entries ?? [])[0]
  const revEntry = (revDetail?.data?.entries ?? [])[0]
  ok('红冲后借转贷', Number(revEntry.debit) === Number(origEntry.credit)
    && Number(revEntry.credit) === Number(origEntry.debit),
    `原 ${origEntry.debit}/${origEntry.credit} → 冲 ${revEntry.debit}/${revEntry.credit}`)
  ok('红冲凭证借贷仍平衡', revDetail?.data?.debitTotal === revDetail?.data?.creditTotal)

  const revAgain = await j('POST', `/vouchers/${draft.data.id}/reverse`, t, { reason: '重复' })
  ok('重复红冲被拒绝', revAgain?.code >= 400, revAgain?.message)

  const revRev = await j('POST', `/vouchers/${revId}/reverse`, t, { reason: '反向' })
  ok('红冲凭证不可再次红冲', revRev?.code >= 400, revRev?.message)

  const tb2 = await j('GET', `/books/trial-balance?endPeriod=${period()}&fiscalYear=${new Date().getFullYear()}`, t)
  ok('红冲后试算仍平衡', tb2?.data?.balanced === true, `差额 ${tb2?.data?.difference}`)

  // ================= 汇总 =================
  console.log(`\n${'='.repeat(60)}`)
  console.log(`通过 ${pass} 项，失败 ${fail} 项`)
  if (fail > 0) {
    console.log('失败用例：')
    failures.forEach((f) => console.log(`  - ${f}`))
    process.exit(1)
  }
  console.log('全部通过')
}

main().catch((e) => {
  console.error('测试执行异常:', e)
  process.exit(1)
})
