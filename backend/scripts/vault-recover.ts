/**
 * 加密迁移崩溃恢复（方案 §9.3，对应 T10）。
 *
 * 场景：迁移进行中进程被 kill / 断电，vault.json 停留在
 * `enabled: 'migrating'` —— 正常启动会拒绝服务，由本脚本收尾：
 *
 *   情况 A：rekey 其实已经成功（库已是密文）→ 用主密码/恢复码校验后补 `enabled: true`
 *   情况 B：库还是明文 → 用 `.pre-encrypt.bak` 覆盖回去并清除 vault.json，下次重新迁移
 *
 * 用法：
 *   npm run vault:recover                       # 交互式（提示输入主密码）
 *   npm run vault:recover -- --password xxx     # 非交互
 *   npm run vault:recover -- --recovery-code XXXX-XXXX-...
 *   npm run vault:recover -- --yes              # 跳过回滚确认（CI 用）
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as readline from 'node:readline'
import {
  coreVaultProvider,
  readVaultMetaFrom,
  vaultFilePath,
  writeVaultMetaAtomic,
  type VaultMeta,
} from '../src/sdk/vault'
import {
  checkVerifier,
  deriveSubKey,
  INFO_DB,
  normalizeRecoveryCode,
} from '../src/sdk/vault-kdf'
import { recoverVaultMigration } from '../src/vault/vault-migrate'
import { openDatabase } from '../src/vault/db-open'

// ==================== 参数解析 ====================

function argValue(flag: string): string | undefined {
  const argv = process.argv.slice(2)
  const inline = argv.find((a) => a.startsWith(`${flag}=`))
  if (inline) return inline.slice(flag.length + 1)
  const idx = argv.indexOf(flag)
  if (idx >= 0) return argv[idx + 1]
  return undefined
}

function ask(question: string): Promise<string> {
  if (!process.stdin.isTTY) return Promise.resolve('')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function confirm(quiz: string): Promise<boolean> {
  if (process.argv.includes('--yes') || process.argv.includes('-y')) return Promise.resolve(true)
  if (!process.stdin.isTTY) return Promise.resolve(false)
  return ask(quiz).then((a) => a.toLowerCase() === 'yes' || a.toLowerCase() === 'y')
}

function resolveDbPath(): string {
  const raw = process.env.DB_DATABASE || './data/financial.db'
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw)
}

// ==================== 主流程 ====================

async function main(): Promise<void> {
  const vaultFile = vaultFilePath()
  const dbPath = resolveDbPath()
  const backupPath = `${dbPath}.pre-encrypt.bak`

  const meta: VaultMeta | null = readVaultMetaFrom(vaultFile)
  console.log(`vault 文件:   ${vaultFile}`)
  console.log(`数据库文件:   ${dbPath}`)
  console.log(`明文备份:     ${backupPath} ${fs.existsSync(backupPath) ? '（存在）' : '（不存在）'}`)

  if (!meta) {
    console.log('\n未找到 vault.json（或格式非法），当前没有加密状态需要恢复。')
    process.exit(0)
  }
  if (meta.enabled !== 'migrating') {
    console.log(`\n当前加密状态为 ${String(meta.enabled)}，无需恢复。`)
    process.exit(0)
  }

  console.log('\n检测到「迁移中」状态，开始恢复…')
  const provider = coreVaultProvider

  // ---------- 先尝试「补齐状态」（库其实已是密文） ----------
  const password = argValue('--password')
  const recoveryCode = argValue('--recovery-code')

  // 依次尝试：主密码 → 恢复码
  for (const useRecovery of [false, true]) {
    const secret = useRecovery ? recoveryCode : password
    if (!secret) continue

    let mk: Buffer | null = null
    try {
      mk = useRecovery
        ? provider.deriveFromRecovery(normalizeRecoveryCode(secret), meta)
        : provider.deriveKey(secret, meta)
    } catch {
      mk = null // 密码/恢复码错
    }
    if (!mk || !checkVerifier(mk, meta.verifier)) {
      console.log(useRecovery ? '恢复码不匹配。' : '主密码不匹配。')
      continue
    }

    // 密码正确：探测数据库能否用派生密钥打开。能打开 = rekey 已完成
    const dbKeyHex = deriveSubKey(mk, INFO_DB).toString('hex')
    try {
      const probe = openDatabase(dbPath, { keyHex: dbKeyHex, legacy: meta.cipher.legacy })
      probe.close()
      const done: VaultMeta = { ...meta, enabled: true }
      writeVaultMetaAtomic(vaultFile, done)
      console.log('\n✅ 数据库其实已加密成功，已补齐状态标记（enabled: true），下次启动可正常解锁。')
      process.exit(0)
    } catch {
      console.log('凭据正确但数据库无法用该密钥打开 —— 迁移实际未完成，尝试回滚。')
      break
    }
  }

  // ---------- 情况 B：回滚到明文备份 ----------
  if (!fs.existsSync(backupPath)) {
    console.error(`\n❌ 无法自动恢复：既无法用正确凭据打开数据库，也没有明文备份（${path.basename(backupPath)}）。`)
    console.error('   请检查是否有其他备份（data/backup、外部快照），必要时从备份恢复数据。')
    process.exit(1)
  }

  const okToRollback = await confirm(
    `将用明文备份覆盖 ${path.basename(dbPath)}、清除 ${path.basename(vaultFile)}，迁移将重新执行。输入 yes 继续: `,
  )
  if (!okToRollback) {
    console.log('已取消，未做任何改动。')
    process.exit(0)
  }

  const result = await recoverVaultMigration(vaultFile, dbPath)
  // 不带凭据调用：跳过「补状态」，必然走回滚分支（已确认备份存在）
  switch (result.result) {
    case 'rolled-back':
      console.log(`\n✅ 已回滚到迁移前的明文库（${result.message}）。下次启动后可重新执行「开启加密」。`)
      break
    case 'already-encrypted':
      console.log(`\n✅ ${result.message}`)
      break
    default:
      console.error(`\n❌ ${result.message}`)
      process.exit(1)
  }
}

main().catch((err) => {
  console.error('恢复脚本异常:', err)
  process.exit(1)
})
