const D = require('better-sqlite3')
const path = require('node:path')

const dbPath = process.argv[2] || path.join('data', 'financial.db')
const db = new D(dbPath)
db.pragma('foreign_keys = OFF')

const targets = db
  .prepare("SELECT id, name FROM sys_company WHERE code != 'DEFAULT'")
  .all()
console.log('待清理公司:', targets.map((t) => t.name).join(', ') || '(无)')

const tables = [
  'fin_voucher_entry',
  'fin_voucher',
  'fin_receipt',
  'fin_payroll_item',
  'fin_payroll',
  'fin_expense_claim_item',
  'fin_expense_claim',
  'fin_employee',
  'fin_income_expense',
  'fin_write_off',
  'fin_cash_flow',
  'fin_initial_balance',
  'fin_bank_account',
  'fin_project',
  'fin_department',
  'fin_partner',
  'fin_classify_rule',
  'fin_account',
]

for (const c of targets) {
  for (const t of tables) {
    try {
      db.prepare(`DELETE FROM ${t} WHERE company_id = ?`).run(c.id)
    } catch (e) {
      console.log(`  skip ${t}: ${e.message}`)
    }
  }
  db.prepare('DELETE FROM sys_user_company WHERE company_id = ?').run(c.id)
  db.prepare('DELETE FROM sys_company WHERE id = ?').run(c.id)
  console.log(`  removed ${c.name}`)
}

console.log('\n剩余公司:', db.prepare('SELECT name, code FROM sys_company').all())
for (const t of ['fin_account', 'fin_partner', 'fin_voucher', 'fin_employee', 'sys_user_company']) {
  console.log(` ${t}:`, db.prepare(`SELECT COUNT(1) c FROM ${t}`).get().c)
}
db.close()