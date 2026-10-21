import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { LessThan, Repository } from 'typeorm'
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { SysLog } from '../../entities/sys-log.entity'
import { User } from '../../entities/user.entity'
import { Company } from '../../entities/company.entity'
import { Account } from '../../entities/account.entity'
import { Partner } from '../../entities/partner.entity'
import { Voucher } from '../../entities/voucher.entity'
import { VoucherEntry } from '../../entities/voucher-entry.entity'
import { resolveDatabasePath } from '../../config/database.config'
import { requireCompanyId } from '../../common/company/company-context'
import { DEFAULT_AUTO_POST_THRESHOLD } from '../../common/company/company.constants'
import { invalidateCompanyCache } from '../../common/company/company-scope.interceptor'
import { CompanyScopedRepository } from '../../common/company/company.repository'
import { InjectCompanyRepo } from '../../common/company/company-repo.decorator'
import type { PageResult, PaginationQueryDto } from '../../common/dto/pagination.dto'

@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name)

  constructor(
    @InjectRepository(SysLog) private readonly logRepo: Repository<SysLog>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    @InjectCompanyRepo(Partner) private readonly partnerRepo: CompanyScopedRepository<Partner>,
    @InjectCompanyRepo(Account) private readonly accountRepo: CompanyScopedRepository<Account>,
    @InjectCompanyRepo(Voucher) private readonly voucherRepo: CompanyScopedRepository<Voucher>,
    @InjectCompanyRepo(VoucherEntry) private readonly entryRepo: CompanyScopedRepository<VoucherEntry>,
  ) {}

  // ==================== 公司信息（当前记账公司） ====================

  /**
   * 读取当前记账公司的信息。
   * 多公司记账后，公司主体信息由 sys_company 承载（每个公司一份），
   * 不再是全局配置，因此票据方向判定天然按公司隔离。
   */
  async getCompanyInfo(): Promise<{
    companyId: string
    companyName: string
    taxNo: string
    code: string
    status: number
    taxpayerType: string
    vatRate: number | null
    taxDeclareCycle: string
    autoPostEnabled: number
    autoPostThreshold: number
  }> {
    const companyId = requireCompanyId()
    const company = await this.companyRepo.findOne({ where: { id: companyId } })
    return {
      companyId,
      companyName: company?.name ?? '',
      taxNo: company?.taxNo ?? '',
      code: company?.code ?? '',
      status: company?.status ?? 0,
      taxpayerType: company?.taxpayerType ?? 'small_scale',
      vatRate: company?.vatRate ?? null,
      taxDeclareCycle: company?.taxDeclareCycle ?? 'month',
      autoPostEnabled: company?.autoPostEnabled ?? 1,
      autoPostThreshold: company?.autoPostThreshold ?? DEFAULT_AUTO_POST_THRESHOLD,
    }
  }

  /** 保存当前记账公司信息 */
  async saveCompanyInfo(dto: {
    companyName?: string
    taxNo?: string
    taxpayerType?: string
    vatRate?: number
    taxDeclareCycle?: string
    autoPostEnabled?: number
    autoPostThreshold?: number
  }): Promise<{ message: string }> {
    const companyId = requireCompanyId()
    const company = await this.companyRepo.findOne({ where: { id: companyId } })
    if (!company) throw new NotFoundException('当前记账公司不存在')
    if (dto.companyName !== undefined) company.name = dto.companyName
    if (dto.taxNo !== undefined) company.taxNo = (dto.taxNo || '').trim().toUpperCase() || null
    if (dto.taxpayerType !== undefined) company.taxpayerType = dto.taxpayerType
    if (dto.vatRate !== undefined) company.vatRate = dto.vatRate
    if (dto.taxDeclareCycle !== undefined) company.taxDeclareCycle = dto.taxDeclareCycle
    if (dto.autoPostEnabled !== undefined) company.autoPostEnabled = dto.autoPostEnabled
    if (dto.autoPostThreshold !== undefined) company.autoPostThreshold = dto.autoPostThreshold
    await this.companyRepo.save(company)
    invalidateCompanyCache(companyId)
    return { message: '公司信息已保存' }
  }

  // ==================== 概览 ====================

  /** 工作台统计 */
  async getDashboard(): Promise<any> {
    const today = new Date().toISOString().slice(0, 10)
    const year = today.slice(0, 4)
    const month = today.slice(0, 7)

    const [
      accountCount,
      partnerCount,
      voucherCount,
      draftCount,
      todayVoucherCount,
      monthVoucherCount,
      companyCount,
    ] = await Promise.all([
      this.accountRepo.count(),
      this.partnerRepo.count(),
      this.voucherRepo.count(),
      this.voucherRepo.count({ where: { status: 'draft' } }),
      this.voucherRepo
        .createQueryBuilder('v')
        .where('v.voucherDate = :today', { today })
        .getCount(),
      this.voucherRepo
        .createQueryBuilder('v')
        .where('v.voucherDate LIKE :month', { month: `${month}%` })
        .getCount(),
      this.companyRepo.count({ where: { status: 1 } }),
    ])

    return {
      accountCount,
      partnerCount,
      voucherCount,
      draftCount,
      todayVoucherCount,
      monthVoucherCount,
      companyCount,
    }
  }

  // ==================== 操作日志 ====================

  async findLogs(
    query: PaginationQueryDto & { module?: string; username?: string; success?: string },
  ): Promise<PageResult<any>> {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const qb = this.logRepo.createQueryBuilder('l')

    if (query.keyword) {
      qb.andWhere('(l.action LIKE :kw OR l.path LIKE :kw OR l.username LIKE :kw)', {
        kw: `%${query.keyword}%`,
      })
    }
    if (query.module) qb.andWhere('l.module = :module', { module: query.module })
    if (query.username) qb.andWhere('l.username = :username', { username: query.username })
    if (query.success !== undefined && query.success !== '') {
      qb.andWhere('l.success = :success', { success: query.success === 'true' || query.success === '1' })
    }
    // created_at 由 SQLite datetime('now') 以 UTC 存储，筛选/排序统一按本地时间比较，否则错 8 小时
    if (query.startDate) {
      qb.andWhere(`datetime(l.createdAt, 'localtime') >= :startDate`, { startDate: query.startDate })
    }
    if (query.endDate) {
      qb.andWhere(`datetime(l.createdAt, 'localtime') <= :endDate`, { endDate: `${query.endDate} 23:59:59` })
    }

    const total = await qb.getCount()
    const { entities, raw } = await qb
      .addSelect(`datetime(l.createdAt, 'localtime')`, 'localCreatedAt')
      .orderBy(`datetime(l.createdAt, 'localtime')`, 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getRawAndEntities()

    // 返回本地时间字符串：否则页面显示的时间比实际早 8 小时，刚产生的日志看起来像清理前的旧日志
    const list = entities.map((e, i) => ({ ...e, createdAt: raw[i]?.localCreatedAt ?? e.createdAt }))

    return { list, total, page, pageSize }
  }

  async cleanLogs(keepDays = 30): Promise<{ message: string }> {
    // created_at 为 UTC 字符串，cutoff 同样转成 UTC 再比较（原先用 Date 等值匹配，永远删不掉）
    const cutoff = new Date(Date.now() - keepDays * 86400000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ')
    const result = await this.logRepo.delete({ createdAt: LessThan(cutoff) as any })
    return { message: `已清理 ${result.affected ?? 0} 条历史日志` }
  }

  /** 记录日志（由日志拦截器调用） */
  async record(entry: Partial<SysLog>): Promise<void> {
    try {
      await this.logRepo.save(this.logRepo.create(entry))
    } catch (err) {
      this.logger.warn(`写入操作日志失败: ${(err as Error).message}`)
    }
  }

  // ==================== 备份与恢复 ====================

  private get backupDir(): string {
    const dir = path.join(path.dirname(resolveDatabasePath()), 'backup')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return dir
  }

  /** 列出可用备份 */
  async listBackups(): Promise<any[]> {
    const dir = this.backupDir
    const files = readdirSync(dir).filter((f) => f.endsWith('.db'))
    const result: any[] = []
    for (const file of files) {
      const full = path.join(dir, file)
      const stat = statSync(full)
      result.push({
        filename: file,
        size: stat.size,
        sizeText: this.formatSize(stat.size),
        createdAt: stat.mtime.toISOString(),
      })
    }
    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  /**
   * 生成备份文件，返回备份文件名
   */
  async createBackup(): Promise<{ filename: string; size: number }> {
    const dbPath = resolveDatabasePath()
    if (!existsSync(dbPath)) throw new NotFoundException('数据库文件不存在')

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `financial-${stamp}.db`
    const target = path.join(this.backupDir, filename)

    // SQLite 在线备份 API，保证一致性
    const Database = require('better-sqlite3')
    const db = new Database(dbPath, { readonly: true })
    try {
      await db.backup(target)
    } finally {
      db.close()
    }

    const size = statSync(target).size
    return { filename, size }
  }

  /** 备份文件下载流 */
  openBackupStream(filename: string) {
    const safe = path.basename(filename)
    const full = path.join(this.backupDir, safe)
    if (!existsSync(full)) throw new NotFoundException('备份文件不存在')
    if (!safe.endsWith('.db')) throw new BadRequestException('非法的备份文件')
    return { stream: createReadStream(full), filename: safe }
  }

  /**
   * 从备份恢复（会覆盖当前数据库，需重启服务生效）
   */
  async restoreBackup(filename: string): Promise<{ message: string; filename: string }> {
    const safe = path.basename(filename)
    const source = path.join(this.backupDir, safe)
    if (!existsSync(source)) throw new NotFoundException('备份文件不存在')

    const dbPath = resolveDatabasePath()
    // 恢复前先给当前库做一份安全备份
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const safety = path.join(this.backupDir, `pre-restore-${stamp}.db`)
    await this.copyDbFile(dbPath, safety)

    await this.copyDbFile(source, dbPath)

    this.logger.warn(`数据库已从备份 ${safe} 恢复，安全备份: ${path.basename(safety)}`)
    return {
      message: `已从备份「${safe}」恢复。安全备份已保存为 pre-restore-${stamp}.db；WAL 模式下新数据在下次重启后完全生效。`,
      filename: safety,
    }
  }

  /**
   * 复制 SQLite 数据库文件。
   * 说明：运行中无法删除 -wal/-shm（文件被占用），
   * 这里采用「先写主库、附属日志由 SQLite 自行重放」的方式，避免 EBUSY。
   */
  private async copyDbFile(from: string, to: string): Promise<void> {
    try {
      await fs.copyFile(from, to)
      return
    } catch (err: any) {
      if (err?.code !== 'EBUSY' && err?.code !== 'EPERM') throw err
    }

    // EBUSY 兜底：使用 SQLite VACUUM INTO 生成一致快照
    const Database = require('better-sqlite3')
    const db = new Database(from, { readonly: true })
    try {
      await db.exec(`VACUUM INTO '${to.replace(/'/g, "''")}'`)
    } finally {
      db.close()
    }
  }

  /** 删除备份文件 */
  async removeBackup(filename: string): Promise<{ message: string }> {
    const safe = path.basename(filename)
    const full = path.join(this.backupDir, safe)
    if (!existsSync(full)) throw new NotFoundException('备份文件不存在')
    await fs.rm(full, { force: true })
    return { message: '备份已删除' }
  }

  // ==================== 工具 ====================

  /** 数据统计（系统信息） */
  async getSystemInfo(): Promise<any> {
    const dbPath = resolveDatabasePath()
    const dbSize = existsSync(dbPath) ? statSync(dbPath).size : 0

    const [accounts, vouchers, entries, users, logs, companies] = await Promise.all([
      this.accountRepo.count(),
      this.voucherRepo.count(),
      this.entryRepo.count(),
      this.userRepo.count(),
      this.logRepo.count(),
      this.companyRepo.count(),
    ])

    return {
      database: {
        driver: 'better-sqlite3',
        path: dbPath,
        size: dbSize,
        sizeText: this.formatSize(dbSize),
      },
      counts: { accounts, vouchers, entries, users, logs, companies },
      nodeVersion: process.version,
      platform: `${process.platform} ${process.arch}`,
      uptime: Math.floor(process.uptime()),
    }
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  }
}
