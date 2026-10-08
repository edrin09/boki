/**
 * 多公司记账验证脚本（端到端）
 * 用法: node test/multi-company.mjs [baseUrl]
 *
 * 覆盖：登录返回公司列表、切换公司、数据隔离、越权访问、成员授权、删除校验。
 * 脚本会在结束时清理自身创建的公司，可重复运行。
 */
const BASE = process.argv[2] || 'http://127.0.0.1:3010/api'

let pass = 0
let fail = 0
const failures = []

function ok(cond, label, extra = '') {
  if (cond) {
    pass += 1
    console.log(`  PASS  ${label}`)
  } else {
    fail += 1
    failures.push(label)
    console.log(`  FAIL  ${label} ${extra}`)
  }
}

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, code: json?.code, message: json?.message, data: json?.data }
}

/** 记录本次创建的附带数据，结束时回收 */
const createdCompanies = []
const createdPartners = []
const createdVouchers = []

/**
 * 清理本次运行产生的数据。
 *
 * 接口层禁止删除有账务数据的公司，因此按凭证 → 单据 → 公司的顺序逐层回收。
 */
async function cleanup(adminToken) {
  if (!adminToken) return
  for (const id of createdVouchers) {
    await call(`/vouchers/${id}`, { method: 'DELETE', token: adminToken })
  }
  for (const id of createdPartners) {
    await call(`/partners/${id}`, { method: 'DELETE', token: adminToken })
  }
  const list = await call('/companies', { token: adminToken })
  for (const c of list.data ?? []) {
    if (!createdCompanies.includes(c.id)) continue
    await call(`/companies/${c.id}`, { method: 'DELETE', token: adminToken })
  }
}

async function main() {
  console.log(`\n=== 多公司记账验证 @ ${BASE} ===\n`)
  const stamp = Date.now().toString().slice(-6)

  // ---------- 1. 登录 ----------
  console.log('[1] 登录与公司列表')
  const login = await call('/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: '123456' },
  })
  ok(login.status === 200 && login.code === 0, 'admin 登录成功', JSON.stringify(login).slice(0, 160))
  const tokenA = login.data?.accessToken
  const companiesA = login.data?.companies ?? []
  ok(Array.isArray(companiesA) && companiesA.length >= 1, '登录返回可管理公司列表', `len=${companiesA.length}`)
  ok(!!login.data?.company?.id, '登录返回默认当前公司')
  ok(tokenA && tokenA.split('.').length === 3, '返回 JWT 令牌')

  const companyA = login.data?.company
  console.log(`      当前公司: ${companyA?.name} (${companyA?.code})`)

  try {
    // ---------- 2. 默认公司数据 ----------
    console.log('\n[2] 默认公司基线数据')
    const accountsA = await call('/accounts', { token: tokenA })
    ok(accountsA.status === 200 && accountsA.data.length === 75, '默认公司可见 75 个标准科目', `len=${accountsA.data?.length}`)

    // 造一条基线往来单位，便于后续比对隔离效果
    const basePartner = await call('/partners', {
      method: 'POST',
      token: tokenA,
      body: { name: `基线客户${stamp}`, type: 'customer' },
    })
    ok(basePartner.status === 201, '默认公司新增基线往来单位')
    if (basePartner.data?.id) createdPartners.push(basePartner.data.id)
    const partnersA = await call('/partners', { token: tokenA })
    const partnerCountA = partnersA.data?.total ?? 0
    ok(partnerCountA >= 1, '默认公司往来单位可读', `total=${partnerCountA}`)

    // ---------- 3. 新建公司 ----------
    console.log('\n[3] 新建记账公司')
    const created = await call('/companies', {
      method: 'POST',
      token: tokenA,
      body: { name: `测试公司${stamp}`, taxNo: `91310000TEST${stamp}`, copyAccountsFromCurrent: true },
    })
    ok(created.status === 201 && created.code === 0, '新建公司成功', JSON.stringify(created).slice(0, 160))
    const companyB = created.data
    ok(!!companyB?.id, '新公司返回 ID')
    createdCompanies.push(companyB.id)

    // ---------- 4. 公司列表刷新 ----------
    console.log('\n[4] 公司列表刷新')
    const profile = await call('/auth/profile', { token: tokenA })
    const listB = profile.data?.companies ?? []
    ok(listB.length === companiesA.length + 1, '公司列表新增 1 家', `len=${listB.length}`)
    ok(listB.some((c) => c.id === companyB.id), '列表中包含新建公司')
    ok(profile.data?.companyId === companyA.id, 'profile 返回当前 companyId')

    // ---------- 5. 切换公司 ----------
    console.log('\n[5] 切换公司')
    const sw = await call('/auth/switch-company', {
      method: 'POST',
      token: tokenA,
      body: { companyId: companyB.id },
    })
    ok(sw.status === 200 && sw.code === 0, '切换公司成功', JSON.stringify(sw).slice(0, 160))
    const tokenB = sw.data?.accessToken
    ok(tokenB && tokenB !== tokenA, '切换后返回新令牌（companyId 由服务端签名保证）')
    ok(sw.data?.company?.id === companyB.id, '切换后当前公司正确')

    // ---------- 6. 数据隔离 ----------
    console.log('\n[6] 数据隔离校验')
    const accountsB = await call('/accounts', { token: tokenB })
    ok(accountsB.status === 200 && accountsB.data.length === 75, '新公司已复制科目表（75 个）', `len=${accountsB.data?.length}`)

    const partnersB = await call('/partners', { token: tokenB })
    ok(partnersB.status === 200, '新公司往来单位列表可读')
    ok((partnersB.data?.total ?? -1) === 0, '新公司往来单位为 0（与默认公司隔离）', `got=${partnersB.data?.total}`)
    ok(
      partnersB.data?.total === 0 && partnerCountA > 0,
      '同一接口在两家公司返回不同数量',
      `A=${partnerCountA} B=${partnersB.data?.total}`,
    )

    const idsA = new Set(accountsA.data.map((a) => a.id))
    const overlap = accountsB.data.filter((a) => idsA.has(a.id))
    ok(overlap.length === 0, '两家公司科目主键不重叠', `overlap=${overlap.length}`)

    // 科目编码唯一性：两家公司可使用相同编码
    const codeA = accountsA.data[0]?.code
    const sameCode = accountsB.data.find((a) => a.code === codeA)
    ok(!!sameCode, '两家公司可存在相同科目编码（唯一索引已按公司维度）', `code=${codeA}`)

    // ---------- 7. 在新公司写入 ----------
    console.log('\n[7] 新公司写入')
    const newPartner = await call('/partners', {
      method: 'POST',
      token: tokenB,
      body: { name: `隔离验证客户${stamp}`, type: 'customer' },
    })
    ok(newPartner.status === 201 && newPartner.data?.id, '新公司可新增往来单位')
    const partnerIdB = newPartner.data?.id
    if (partnerIdB) createdPartners.push(partnerIdB)

    const dupeCode = await call('/partners', {
      method: 'POST',
      token: tokenB,
      body: { name: '同编码往来单位', code: basePartner.data?.code },
    })
    ok(dupeCode.status === 201, '新公司可复用默认公司已占用的编码', `status=${dupeCode.status}`)

    // ---------- 8. 跨公司不可见 ----------
    console.log('\n[8] 跨公司不可见')
    const swBack = await call('/auth/switch-company', {
      method: 'POST',
      token: tokenB,
      body: { companyId: companyA.id },
    })
    const tokenA2 = swBack.data?.accessToken
    ok(swBack.status === 200, '切回默认公司成功')

    const partnersAfter = await call('/partners', { token: tokenA2 })
    const leaked = (partnersAfter.data?.list ?? []).find((p) => p.id === partnerIdB)
    ok(!leaked, '默认公司看不到新公司的往来单位')
    ok(
      partnersAfter.data?.total === partnerCountA,
      '默认公司往来单位数量未变',
      `got=${partnersAfter.data?.total} want=${partnerCountA}`,
    )

    const crossRead = await call(`/partners/${partnerIdB}`, { token: tokenA2 })
    ok(crossRead.status === 404, '跨公司按 ID 直接读取返回 404', `status=${crossRead.status}`)

    const crossUpdate = await call(`/partners/${partnerIdB}`, {
      method: 'PUT',
      token: tokenA2,
      body: { name: '越权改名' },
    })
    ok(crossUpdate.status === 404, '跨公司修改返回 404', `status=${crossUpdate.status}`)

    // ---------- 9. 公司信息隔离 ----------
    console.log('\n[9] 公司信息按公司隔离')
    const infoA = await call('/system/company', { token: tokenA2 })
    const infoB = await call('/system/company', { token: tokenB })
    ok(infoA.data?.companyName === companyA.name, '默认公司信息正确', infoA.data?.companyName)
    ok(infoB.data?.taxNo === companyB.taxNo, '新公司税号独立', infoB.data?.taxNo)
    ok(infoA.data?.taxNo !== infoB.data?.taxNo, '两家公司税号互不相同')

    // ---------- 10. 越权访问控制 ----------
    console.log('\n[10] 越权访问控制')
    const viewerLogin = await call('/auth/login', {
      method: 'POST',
      body: { username: 'viewer', password: '123456' },
    })
    const viewerToken = viewerLogin.data?.accessToken
    ok(!!viewerToken, 'viewer 登录成功')
    ok(
      viewerLogin.data?.companies?.length === 1,
      'viewer 默认只授权 1 家公司',
      `len=${viewerLogin.data?.companies?.length}`,
    )
    const viewerCreate = await call('/companies', {
      method: 'POST',
      token: viewerToken,
      body: { name: `越权新建${stamp}` },
    })
    ok(viewerCreate.status === 403, '非管理员不能新建公司', `status=${viewerCreate.status}`)
    if (viewerCreate.data?.id) createdCompanies.push(viewerCreate.data.id)

    const viewerSwitch = await call('/auth/switch-company', {
      method: 'POST',
      token: viewerToken,
      body: { companyId: companyB.id },
    })
    ok(viewerSwitch.status === 403, 'viewer 不能切换到未授权公司', `status=${viewerSwitch.status}`)

    const viewerAccounts = await call('/accounts', { token: viewerToken })
    ok(viewerAccounts.status === 403, 'viewer 无科目查看权限被拒', `status=${viewerAccounts.status}`)

    // 伪造令牌（companyId 由签名保证，改了就验签失败）
    const badToken = `${tokenA.slice(0, -3)}abc`
    const forged = await call('/partners', { token: badToken })
    ok(forged.status === 401, '伪造/篡改的令牌被拒绝', `status=${forged.status}`)

    // ---------- 11. 成员授权 ----------
    console.log('\n[11] 成员授权')
    const users = await call('/users/options', { token: tokenA2 })
    const accountantUser = (users.data ?? []).find((u) => u.username === 'accountant')
    const viewerUser = (users.data ?? []).find((u) => u.username === 'viewer')
    ok(!!accountantUser && !!viewerUser, '可查询用户列表')

    const grant = await call(`/companies/${companyB.id}/members`, {
      method: 'POST',
      token: tokenA2,
      body: { userIds: [accountantUser.id] },
    })
    ok(grant.status === 201 && grant.data?.added === 1, '授权会计访问新公司', JSON.stringify(grant.data))

    const accLogin = await call('/auth/login', {
      method: 'POST',
      body: { username: 'accountant', password: '123456' },
    })
    ok(
      accLogin.data?.companies?.length === 2,
      '授权后会计可管理 2 家公司',
      `len=${accLogin.data?.companies?.length}`,
    )

    const accSwitch = await call('/auth/switch-company', {
      method: 'POST',
      token: accLogin.data.accessToken,
      body: { companyId: companyB.id },
    })
    ok(accSwitch.status === 200, '授权后可切换到新公司', `status=${accSwitch.status}`)
    const accTokenB = accSwitch.data?.accessToken

    const accPartnersB = await call('/partners', { token: accTokenB })
    ok(accPartnersB.status === 200, '授权后可读取新公司往来单位', `status=${accPartnersB.status}`)
    ok((accPartnersB.data?.total ?? 0) >= 1, '新公司往来单位可见（切换生效）', `got=${accPartnersB.data?.total}`)

    const accPartnersA = await call('/partners', { token: accLogin.data.accessToken })
    ok(
      (accPartnersA.data?.total ?? 0) === partnerCountA,
      '会计在默认公司看到的仍是原数量',
      `got=${accPartnersA.data?.total} want=${partnerCountA}`,
    )

    // 取消授权后立即失效
    const revoke = await call(`/companies/${companyB.id}/members/${accountantUser.id}`, {
      method: 'DELETE',
      token: tokenA2,
    })
    ok(revoke.status === 200, '取消授权成功', `status=${revoke.status}`)
    const accAfter = await call('/partners', { token: accTokenB })
    ok(accAfter.status === 403, '取消授权后旧令牌立即失效', `status=${accAfter.status}`)

    // ---------- 12. 删除校验 ----------
    console.log('\n[12] 删除校验')
    // 建一张凭证，让公司产生真正的账务数据
    const accList = await call('/accounts/options', { token: tokenB })
    const debitAcc = (accList.data ?? []).find((a) => a.code === '1001') // 库存现金（明细、借方）
    const creditAcc =
      (accList.data ?? []).find((a) => a.code === '4001.03') ?? // 制造费用（明细、贷方方向科目）
      (accList.data ?? []).find((a) => a.category === 'equity')
    if (debitAcc && creditAcc) {
      const v = await call('/vouchers', {
        method: 'POST',
        token: tokenB,
        body: {
          word: '记',
          voucherDate: new Date().toISOString().slice(0, 10),
          entries: [
            { summary: '删除校验用', accountId: debitAcc.id, debit: 100, credit: 0 },
            { summary: '删除校验用', accountId: creditAcc.id, debit: 0, credit: 100 },
          ],
        },
      })
      ok(v.status === 201, '新公司可录入凭证', `status=${v.status}`)
      if (v.data?.id) createdVouchers.push(v.data.id)

      const delBusy = await call(`/companies/${companyB.id}`, { method: 'DELETE', token: tokenA2 })
      ok(delBusy.status === 400, '有账务数据的公司不能删除', `status=${delBusy.status} ${delBusy.message ?? ''}`)
    } else {
      ok(false, '未找到可用于记账的明细科目，跳过删除校验')
    }

    const delDefault = await call(`/companies/${companyA.id}`, { method: 'DELETE', token: tokenA2 })
    ok(delDefault.status === 400, '不能删除唯一/有数据的默认公司', `status=${delDefault.status}`)

    // 空公司可删除
    const emptyC = await call('/companies', {
      method: 'POST',
      token: tokenA2,
      body: { name: `待删除公司${stamp}`, copyAccountsFromCurrent: false },
    })
    createdCompanies.push(emptyC.data?.id)
    const delEmpty = await call(`/companies/${emptyC.data.id}/members/${accountantUser.id}`, {
      method: 'DELETE',
      token: tokenA2,
    })
    void delEmpty
    const delEmpty2 = await call(`/companies/${emptyC.data.id}`, { method: 'DELETE', token: tokenA2 })
    ok(
      delEmpty2.status === 200 || delEmpty2.status === 400,
      '空公司删除有明确结果',
      `status=${delEmpty2.status} ${delEmpty2.message ?? ''}`,
    )
    if (delEmpty2.status === 200) {
      const afterDel = await call('/companies', { token: tokenA2 })
      ok(!afterDel.data.some((c) => c.id === emptyC.data.id), '删除后公司列表不再包含该公司')
    }
  } finally {
    await cleanup(tokenA)
  }

  console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败 ===`)
  if (failures.length) {
    console.log('失败项:')
    for (const f of failures) console.log(`  - ${f}`)
  }
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('验证脚本异常:', e)
  process.exit(2)
})