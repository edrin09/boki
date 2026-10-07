/**
 * 重置数据库（仅用于开发/测试，会清空全部业务数据）
 *
 * 用法：
 *   npm run db:reset          # 删除数据库文件，下次启动自动重建并初始化种子数据
 *   npm run db:reset -- --yes # 跳过确认
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as readline from 'node:readline'

function resolveDbPath(): string {
  const raw = process.env.DB_DATABASE || './data/financial.db'
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw)
}

async function confirm(): Promise<boolean> {
  if (process.argv.includes('--yes') || process.argv.includes('-y')) return true
  if (!process.stdin.isTTY) return true

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise<string>((resolve) => {
    rl.question('确认删除数据库文件并重置全部数据？输入 yes 继续: ', resolve)
  })
  rl.close()
  return answer.trim().toLowerCase() === 'yes'
}

async function main(): Promise<void> {
  const dbPath = resolveDbPath()
  const exists = fs.existsSync(dbPath)

  console.log(`数据库路径: ${dbPath}`)
  if (!exists) {
    console.log('数据库文件不存在，无需重置。下次启动会自动创建并写入种子数据。')
    return
  }

  const size = fs.statSync(dbPath).size
  console.log(`当前文件大小: ${(size / 1024).toFixed(2)} KB`)

  const ok = await confirm()
  if (!ok) {
    console.log('已取消。')
    return
  }

  for (const suffix of ['', '-wal', '-shm']) {
    const target = `${dbPath}${suffix}`
    if (fs.existsSync(target)) {
      fs.rmSync(target, { force: true })
      console.log(`已删除: ${path.basename(target)}`)
    }
  }

  // 清理历史备份，避免占位
  const backupDir = path.join(path.dirname(dbPath), 'backup')
  if (fs.existsSync(backupDir)) {
    for (const file of fs.readdirSync(backupDir)) {
      if (file.endsWith('.db')) {
        fs.rmSync(path.join(backupDir, file), { force: true })
        console.log(`已删除备份: ${file}`)
      }
    }
  }

  console.log('\n重置完成。重新启动后端即可得到全新的数据库（含权限、角色、科目、默认用户）。')
}

main().catch((err) => {
  console.error('重置失败:', err)
  process.exit(1)
})