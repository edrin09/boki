/**
 * 一次性修复历史乱码：multer/busboy 旧版本默认以 latin1 解码 multipart filename，
 * 导致 fin_receipt.file_name（以及已生成的 fin_voucher.remark / fin_voucher_entry.summary）
 * 中的中文被存成 UTF-8-as-latin1 乱码。
 *
 * 用法（在 backend 目录下）：
 *   npm run db:fix-filenames            # 修复默认 data/financial.db
 *   node scripts/fix-filename-mojibake.cjs <db-path>  # 指定数据库路径
 *
 * 仅回写确认能还原为中文的字段，其余行保持不变（幂等，可重复执行）。
 */
const Database = require('better-sqlite3')
const path = require('node:path')

const dbPath = process.argv[2] || path.join(process.cwd(), 'data', 'financial.db')
const db = new Database(dbPath)

const LATIN1_HIGH = /[\u0080-\u00ff]/
const REPLACEMENT_CHAR = /\uFFFD/
const CJK =
  /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\u31f0-\u31ff\uac00-\ud7af]/

function recoverSegment(segment) {
  const recovered = Buffer.from(segment, 'latin1').toString('utf8')
  if (REPLACEMENT_CHAR.test(recovered)) return null
  if (!CJK.test(recovered)) return null
  return recovered
}

function recoverFilename(name) {
  if (!name || !LATIN1_HIGH.test(name)) return name
  let out = ''
  let run = ''
  const flush = () => {
    if (run) {
      const fixed = recoverSegment(run)
      out += fixed !== null ? fixed : run
      run = ''
    }
  }
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i)
    if (code >= 0x80 && code <= 0xff) {
      run += name[i]
    } else {
      flush()
      out += name[i]
    }
  }
  flush()
  return out === name ? name : out
}

function fixColumn(table, column) {
  const rows = db.prepare(`SELECT id, ${column} AS val FROM ${table}`).all()
  let fixed = 0
  const update = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE id = ?`)
  for (const r of rows) {
    if (!r.val) continue
    const recovered = recoverFilename(r.val)
    if (recovered !== r.val) {
      update.run(recovered, r.id)
      fixed++
      console.log(`  [${table}.${column}] ${JSON.stringify(r.val)} -> ${JSON.stringify(recovered)}`)
    }
  }
  return fixed
}

console.log(`数据库: ${dbPath}`)
let total = 0
total += fixColumn('fin_receipt', 'file_name')
total += fixColumn('fin_voucher', 'remark')
total += fixColumn('fin_voucher_entry', 'summary')
db.close()
console.log(`\n完成，共修复 ${total} 处乱码。`)