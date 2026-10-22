/**
 * S0 · 驱动能力探针（回归用）
 *
 * 验证 better-sqlite3-multiple-ciphers 在当前 Node / 平台上：
 *  1. 不设 cipher 时保持明文行为（现有库零感知）
 *  2. cipher=sqlcipher + 原始密钥 可加解密
 *  3. PRAGMA rekey 可把明文库原地转成密文（迁移主路径）
 *  4. VACUUM INTO 产物为密文且可用同一密钥读回（备份/恢复主路径）
 *  5. db.backup() 在密文库上不可用（改用 VACUUM INTO）
 *
 * 运行：node test/vault-driver.mjs
 */
import Database from 'better-sqlite3'
import { randomBytes } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

let failed = 0
const log = (...a) => { console.log(...a); }
const ok = (n) => { log(`  [OK]   ${n}`); }
const bad = (n, e) => { failed += 1; log(`  [FAIL] ${n} :: ${e?.message ?? e}`); }
const section = (n) => { log(`\n=== ${n} ===`); }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boki-vault-driver-'))
const isPlain = (p) => fs.readFileSync(p).subarray(0, 16).toString('latin1').startsWith('SQLite format 3')

section('1 · 明文模式（不设 cipher）')
{
  const p = path.join(dir, 'plain.db')
  const db = new Database(p)
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)')
  db.prepare('INSERT INTO t (v) VALUES (?)').run('凭证金额 100')
  db.close()
  if (isPlain(p)) { ok('文件头仍是 SQLite format 3'); } else { bad('明文模式被意外加密'); }
  if (fs.readFileSync(p).includes(Buffer.from('凭证金额', 'utf8'))) { ok('明文库内容可读（未加密）'); } else { bad('明文库内容不可读'); }
}

const keyHex = randomBytes(32).toString('hex')
const openEnc = (p, key = keyHex) => {
  const db = new Database(p)
  db.pragma("cipher = 'sqlcipher'")
  db.pragma('legacy = 4')
  db.pragma(`key = "x'${key}'"`)
  db.pragma('cipher_memory_security = ON')
  return db
}

section('2 · cipher=sqlcipher + 原始密钥')
{
  const p = path.join(dir, 'enc.db')
  const db = openEnc(p)
  db.pragma('journal_mode = WAL')
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)')
  db.prepare('INSERT INTO t (v) VALUES (?)').run('凭证金额 100')
  db.close()
  if (!isPlain(p)) { ok('文件头不再是 SQLite format 3'); } else { bad('密文库仍带明文标志'); }
  if (!fs.readFileSync(p).includes(Buffer.from('凭证金额', 'utf8'))) { ok('磁盘上搜不到业务字段'); } else { bad('密文库仍含明文'); }
  const db2 = openEnc(p)
  const n = db2.prepare('SELECT count(*) c FROM t').get().c
  db2.close()
  if (n === 1) { ok('用同一密钥重开可读'); } else { bad('重开行数不对', n); }
  let threw = false
  try {
    const db3 = openEnc(p, randomBytes(32).toString('hex'))
    db3.prepare('SELECT count(*) c FROM t').get()
    db3.close()
  } catch { threw = true; }
  if (threw) { ok('错误密钥打不开（file is not a database）'); } else { bad('错误密钥竟然能打开'); }
}

section('3 · PRAGMA rekey（明文库 → 密文库）')
{
  const p = path.join(dir, 'rekey.db')
  const db = new Database(p)
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)')
  db.prepare('INSERT INTO t (v) VALUES (?)').run('凭证金额 100')
  db.close()
  const newKey = randomBytes(32).toString('hex')
  let err = null
  const db2 = new Database(p)
  try {
    db2.pragma("cipher = 'sqlcipher'")
    db2.pragma('legacy = 4')
    db2.pragma(`rekey = "x'${newKey}'"`)
  } catch (e) { err = e }
  try { db2.close(); } catch { /* noop */ }
  if (err) { bad(`rekey 失败：${err.message}`); } else {
    if (!isPlain(p)) { ok('rekey 后文件已变为密文'); } else { bad('rekey 后文件仍是明文'); }
    const db3 = openEnc(p, newKey)
    const n = db3.prepare('SELECT count(*) c FROM t').get().c
    db3.close()
    if (n === 1) { ok('rekey 后用新密钥可读'); } else { bad('rekey 后读不到数据', n); }
  }
}

section('4 · VACUUM INTO（密文备份主路径）')
{
  const p = path.join(dir, 'bk.db')
  const db = openEnc(p)
  db.pragma('journal_mode = WAL')
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)')
  const ins = db.prepare('INSERT INTO t (v) VALUES (?)')
  const tx = db.transaction((n) => { for (let i = 0; i < n; i++) { ins.run(`凭证${i}`); } })
  tx(200)
  const target = path.join(dir, 'bk-out.db')
  let err = null
  try { db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`); } catch (e) { err = e }
  db.close()
  if (err) { bad(`VACUUM INTO 失败：${err.message}`); } else {
    if (!isPlain(target)) { ok('备份产物为密文'); } else { bad('备份产物是明文'); }
    const db2 = openEnc(target)
    const n = db2.prepare('SELECT count(*) c FROM t').get().c
    db2.close()
    if (n === 200) { ok('备份产物用同一密钥可读'); } else { bad('备份产物行数不对', n); }
  }
}

section('5 · db.backup() 在密文库上的可用性（记录结论）')
{
  const p = path.join(dir, 'bk2.db')
  const db = openEnc(p)
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)')
  db.prepare('INSERT INTO t (v) VALUES (?)').run('凭证')
  const target = path.join(dir, 'bk2-out.db')
  let err = null
  try { await db.backup(target); } catch (e) { err = e; }
  db.close()
  if (err) {
    ok(`db.backup() 在密文库上不可用（已改用 VACUUM INTO）：${err.message}`)
  } else {
    ok('db.backup() 在密文库上可用（仍优先用 VACUUM INTO 以获得一致性快照）')
  }
}

section('6 · scrypt 成本参数')
{
  const { scryptSync } = await import('node:crypto')
  const salt = randomBytes(32)
  const t0 = Date.now()
  scryptSync('master-password', salt, 32, { N: 32768, r: 8, p: 1, maxmem: 128 * 32768 * 8 * 2 })
  const cost = Date.now() - t0
  log(`  N=32768 派生耗时 ${cost} ms`)
  if (cost < 2000) { ok('派生耗时可接受（解锁体验）'); } else { bad('派生耗时过长', cost); }
  let threw = false
  try { scryptSync('master-password', salt, 32, { N: 32768, r: 8, p: 1 }); } catch { threw = true; }
  if (threw) { ok('默认 maxmem 会抛错（实现里必须显式传 maxmem）'); } else { bad('默认 maxmem 未抛错，需复核'); }
}

try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }) } catch { /* Windows 下偶发句柄占用，忽略 */ }
log(`\n${failed === 0 ? '全部通过' : `失败 ${failed} 项`}`)
process.exit(failed === 0 ? 0 : 1)
