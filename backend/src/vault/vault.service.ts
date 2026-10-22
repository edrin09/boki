/**
 * Vault 内核服务：加密能力的**执行层**。
 *
 * 职责划分（方案 D1）：
 * - 内核（本文件）：密钥派生、库加密、锁定 / 解锁、恢复码、闲置锁定策略、状态查询
 * - vault 插件：开启向导、改主密码的交互、恢复码展示、审计展示、卸载守卫
 *
 * 本服务被 vault 插件直接调用（插件 import `VaultModule`），
 * 因此**不能**在插件缺席时失效 —— 拔掉插件后内核仍可解锁、锁定、查询状态。
 */
import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { randomBytes } from 'node:crypto'
import {
  DEFAULT_CIPHER_PARAMS,
  readVaultMeta,
  resolveVaultProvider,
  vaultFilePath,
  writeVaultMeta,
  type VaultKdfParams,
  type VaultMeta,
  type VaultProvider,
} from '../sdk/vault'
import {
  DEFAULT_KDF,
  INFO_KEK_PASSWORD,
  INFO_KEK_RECOVERY,
  checkVerifier,
  deriveKek,
  formatRecoveryCode,
  generateRecoveryCode,
  makeVerifier,
  unwrapKey,
  wrapKey,
} from '../sdk/vault-kdf'
import {
  clearMasterKey,
  getBootKeyHex,
  getMasterKey,
  isVaultEnabledState,
  setMasterKey,
  setVaultEnabled,
} from './keystore'
import { enableVaultEncryption } from './vault-migrate'
import { SysConfig } from '../entities/sys-config.entity'

/** 闲置锁定策略的 sys_config 键 */
export const IDLE_LOCK_CONFIG_KEY = 'vault.idle_lock_min'

/** 主密码最小长度 */
export const MIN_PASSWORD_LENGTH = 12

/** 待确认的恢复码（仅存在于内存，进程退出即失效） */
interface PendingRecovery {
  code: string
  kdf: VaultKdfParams
  confirmed: boolean
  createdAt: string
}

export interface VaultStatus {
  /** 是否启用加密 */
  enabled: boolean
  /** 是否处于锁定态（已加密但未解锁） */
  locked: boolean
  /** provider id */
  provider: string | null
  /** KDF 参数（公开部分） */
  kdf: { algo: string; N: number; r: number; p: number } | null
  /** 创建时间 */
  createdAt: string | null
  /** 是否已启用恢复码 */
  hasRecovery: boolean
  /** 迁移中间态 */
  migrating: boolean
}

export interface VaultInfo extends VaultStatus {
  /** 主密码轮换次数 */
  rotation: { at: string; count: number } | null
  /** 恢复码创建时间 */
  recoveryCreatedAt: string | null
  /** 闲置锁定分钟数（0 = 关闭） */
  idleLockMinutes: number
  /** 附件加密状态 */
  attachments: { enabled: boolean; encryptedAt: string | null; count: number } | null
  /** 当前实例是否由「无人值守模式」启动（BOKI_VAULT_KEY） */
  unattended: boolean
}

@Injectable()
export class VaultService {
  private readonly logger = new Logger(VaultService.name)

  /** 待确认的恢复码（内存态） */
  private pendingRecovery: PendingRecovery | null = null

  /** 当前进程是否以「恢复码」解锁（允许不带原主密码直接重设主密码） */
  private recoveryUnlocked = false

  /** 最后一次鉴权活动时间 */
  private lastActivityAt = Date.now()

  /** 闲置锁定定时器 */
  private idleTimer: NodeJS.Timeout | null = null

  /** 无钥匙启动（BOKI_VAULT_KEY）时为 true */
  private unattended = false

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(SysConfig) private readonly configRepo: Repository<SysConfig>,
  ) {}

  // ==================== 状态 ====================

  /** 读取当前 vault 元数据 */
  meta(): VaultMeta | null {
    return readVaultMeta()
  }

  /** 轻量状态（前端启动时查询） */
  status(): VaultStatus {
    const meta = this.meta()
    if (!meta || meta.enabled === false) {
      return {
        enabled: false,
        locked: false,
        provider: null,
        kdf: null,
        createdAt: null,
        hasRecovery: false,
        migrating: false,
      }
    }
    return {
      enabled: true,
      locked: !getBootKeyHex(),
      provider: meta.provider,
      kdf: { algo: meta.kdf.algo, N: meta.kdf.N, r: meta.kdf.r, p: meta.kdf.p },
      createdAt: meta.createdAt,
      hasRecovery: !!meta.recovery?.enabled,
      migrating: meta.enabled === 'migrating',
    }
  }

  /** 完整信息（设置页用） */
  info(): VaultInfo {
    const meta = this.meta()
    const status = this.status()
    return {
      ...status,
      rotation: meta?.rotation ?? null,
      recoveryCreatedAt: meta?.recovery?.createdAt ?? null,
      idleLockMinutes: this.getIdleLockMinutes(),
      attachments: meta?.attachments
        ? { enabled: meta.attachments.enabled, encryptedAt: meta.attachments.encryptedAt ?? null, count: meta.attachments.count ?? 0 }
        : null,
      unattended: this.unattended,
    }
  }

  /** 标记为「无人值守模式」（BOKI_VAULT_KEY 启动） */
  markUnattended(): void {
    this.unattended = true
  }

  // ==================== 解锁 / 锁定 ====================

  /**
   * 解锁：口令或恢复码 → MK → 放入密钥保管器。
   *
   * @param payload `{ password }` 或 `{ recoveryCode }`
   */
  async unlock(payload: { password?: string; recoveryCode?: string }): Promise<{ unlocked: true }> {
    const meta = this.meta()
    if (!meta || meta.enabled === false) {
      throw new BadRequestException('当前数据库未启用加密')
    }
    if (meta.enabled === 'migrating') {
      throw new BadRequestException('数据库正在迁移中，请先完成恢复：npm run vault:recover')
    }

    const provider = this.requireProvider(meta)
    let mk: Buffer
    try {
      if (payload.recoveryCode) {
        if (!provider.deriveFromRecovery) throw new Error('当前环境未启用恢复码')
        mk = provider.deriveFromRecovery(payload.recoveryCode, meta)
      } else {
        if (!payload.password) throw new Error('请输入主密码')
        mk = provider.deriveKey(payload.password, meta)
      }
    } catch (err) {
      throw new UnauthorizedException({
        code: 40110,
        message: (err as Error).message || '主密码错误',
      })
    }

    if (!checkVerifier(mk, meta.verifier)) {
      throw new UnauthorizedException({
        code: 40110,
        message: '密钥与数据文件不匹配，数据可能已损坏',
      })
    }

    const wasLocked = !getBootKeyHex()
    setMasterKey(mk)
    setVaultEnabled(true)
    // 恢复码与主密码派生的是同一个 MK：本进程内允许直接重设主密码（§4.4 恢复模式）
    this.recoveryUnlocked = !!payload.recoveryCode

    if (wasLocked) {
      await this.reopenDataSource()
      this.logger.log('Vault 已解锁')
    }
    this.touchActivity()
    return { unlocked: true }
  }

  /**
   * 锁定：丢弃内存中的密钥并关闭数据库连接。
   *
   * 进程不退出：前端会收到 423 并弹出锁定遮罩，解锁后原地继续。
   */
  async lock(): Promise<{ locked: true }> {
    if (!isVaultEnabledState() && !this.meta()) {
      throw new BadRequestException('当前数据库未启用加密')
    }
    clearMasterKey()
    try {
      if (this.dataSource.isInitialized) {
        await this.dataSource.destroy()
      }
    } catch (err) {
      this.logger.warn(`关闭数据连接失败：${(err as Error).message}`)
    }
    this.logger.log('Vault 已锁定')
    return { locked: true }
  }

  /** 锁定后重新建立数据库连接 */
  private async reopenDataSource(): Promise<void> {
    try {
      if (!this.dataSource.isInitialized) {
        await this.dataSource.initialize()
      }
    } catch (err) {
      this.logger.error(`重新连接数据库失败：${(err as Error).message}`)
      throw new BadRequestException('重新连接数据库失败，请重启服务')
    }
  }

  // ==================== 开启加密 ====================

  /**
   * 生成「待确认的恢复码」（开启加密前）。
   *
   * 恢复码明文只在本次响应里出现一次，服务端只在内存里保留待确认状态。
   */
  prepareRecoveryCode(): { code: string; formatted: string; createdAt: string } {
    const code = generateRecoveryCode()
    this.pendingRecovery = {
      code,
      kdf: { ...DEFAULT_KDF, salt: randomBytes(32).toString('hex') },
      confirmed: false,
      createdAt: new Date().toISOString(),
    }
    return { code, formatted: formatRecoveryCode(code), createdAt: this.pendingRecovery.createdAt }
  }

  /**
   * 确认恢复码（用户回填，防止「根本没抄下来」）。
   *
   * @param code 用户回填的恢复码
   */
  confirmRecoveryCode(code: string): { confirmed: true } {
    if (!this.pendingRecovery) {
      throw new BadRequestException('请先生成恢复码')
    }
    const normalized = code.replace(/[\s-]/g, '').toUpperCase()
    if (normalized !== this.pendingRecovery.code) {
      throw new BadRequestException('恢复码不匹配，请重新输入')
    }
    this.pendingRecovery.confirmed = true
    return { confirmed: true }
  }

  /**
   * 开启加密（明文库 → 密文库）。
   *
   * 前置条件由插件在 UI 层强制勾选（恢复码已确认、备份已验证、风险已阅读）。
   */
  async enable(dto: { password: string; confirm: string }): Promise<{
    message: string
    vouchersBefore: number
    vouchersAfter: number
  }> {
    const meta = this.meta()
    if (meta && meta.enabled !== false) {
      throw new BadRequestException('当前数据库已启用加密')
    }
    if (!dto.password || dto.password !== dto.confirm) {
      throw new BadRequestException('两次输入的主密码不一致')
    }
    this.assertPasswordStrength(dto.password)

    const pending = this.pendingRecovery
    if (!pending?.confirmed) {
      throw new BadRequestException('请先生成并确认恢复码，再开启加密')
    }

    const provider = this.requireProvider(null)
    const dbPath = this.resolveDatabasePath()

    // 关闭连接，停止所有写入
    const wasInitialized = this.dataSource.isInitialized
    if (wasInitialized) {
      await this.dataSource.destroy()
    }

    try {
      const result = await enableVaultEncryption({
        dbPath,
        vaultFile: vaultFilePath(),
        masterPassword: dto.password,
        recoveryCode: pending.code,
        provider,
        onProgress: (step, percent) => this.logger.log(`[vault] ${step} (${percent}%)`),
      })

      // 迁移后立即用新密钥打开连接
      setMasterKey(this.deriveMkFromMeta(result.meta, dto.password))
      setVaultEnabled(true)
      if (!this.dataSource.isInitialized) {
        await this.dataSource.initialize()
      }

      this.pendingRecovery = null
      this.logger.log(`Vault 加密已开启，凭证 ${result.vouchersBefore} → ${result.vouchersAfter}`)
      return {
        message: '加密已开启，请牢记主密码与恢复码',
        vouchersBefore: result.vouchersBefore,
        vouchersAfter: result.vouchersAfter,
      }
    } catch (err) {
      // 迁移失败：恢复连接（此时库可能仍是明文）
      try {
        if (!this.dataSource.isInitialized) await this.dataSource.initialize()
      } catch { /* noop */ }
      throw err
    } finally {
      void wasInitialized
    }
  }

  // ==================== 主密码 / 恢复码 ====================

  /**
   * 修改主密码。
   *
   * 只重新包装 MK，**不动数据库、不动附件** —— 因此是秒级操作，
   * 也不会让历史附件失效。
   *
   * 特例：本进程以恢复码解锁的（忘记主密码场景），允许不带 oldPassword
   * 直接设置新主密码（§4.4「恢复模式 → 立即强制设置新主密码」）。
   */
  async changeMasterPassword(dto: { oldPassword: string; newPassword: string }): Promise<{ message: string }> {
    const meta = this.meta()
    if (!meta || meta.enabled === false) {
      throw new BadRequestException('当前数据库未启用加密')
    }
    if (meta.enabled === 'migrating') {
      throw new BadRequestException('数据库正在迁移中，请先完成恢复')
    }
    this.assertPasswordStrength(dto.newPassword)

    const provider = this.requireProvider(meta)
    let mk: Buffer
    if (dto.oldPassword) {
      try {
        mk = provider.deriveKey(dto.oldPassword, meta)
      } catch {
        throw new UnauthorizedException({ code: 40110, message: '原主密码不正确' })
      }
      if (!checkVerifier(mk, meta.verifier)) {
        throw new UnauthorizedException({ code: 40110, message: '原主密码不正确' })
      }
      this.recoveryUnlocked = false
    } else if (this.recoveryUnlocked) {
      const current = getMasterKey()
      if (!current) throw new BadRequestException('数据已锁定，请先解锁')
      mk = Buffer.from(current)
      this.recoveryUnlocked = false
    } else {
      throw new BadRequestException('请先输入原主密码')
    }

    const kdf: VaultKdfParams = { ...meta.kdf, salt: randomBytes(32).toString('hex') }
    const kek = deriveKek(dto.newPassword, kdf, INFO_KEK_PASSWORD)
    const next: VaultMeta = {
      ...meta,
      kdf,
      keyWrap: wrapKey(mk, kek),
      rotation: { at: new Date().toISOString(), count: (meta.rotation?.count ?? 0) + 1 },
    }
    writeVaultMeta(next)

    // 内存中的 MK 不变（数据库密钥、附件密钥都不受影响）
    setMasterKey(mk)
    this.logger.log(`主密码已修改（第 ${next.rotation!.count} 次）`)
    return { message: '主密码已修改，恢复码仍然有效' }
  }

  /**
   * 重新生成恢复码（已加密的库）。
   *
   * 明文只在本次响应返回一次。
   */
  regenerateRecoveryCode(): { code: string; formatted: string; createdAt: string } {
    const meta = this.meta()
    if (!meta || meta.enabled === false) {
      throw new BadRequestException('当前数据库未启用加密')
    }
    const mk = this.currentMasterKey(meta)
    const code = generateRecoveryCode()
    const kdf: VaultKdfParams = { ...DEFAULT_KDF, salt: randomBytes(32).toString('hex') }
    const kek = deriveKek(code, kdf, INFO_KEK_RECOVERY)
    const next: VaultMeta = {
      ...meta,
      recovery: { enabled: true, createdAt: new Date().toISOString(), kdf, wrap: wrapKey(mk, kek) },
    }
    writeVaultMeta(next)
    this.logger.log('恢复码已重新生成')
    return { code, formatted: formatRecoveryCode(code), createdAt: next.recovery!.createdAt! }
  }

  // ==================== 闲置锁定 ====================

  /**
   * 读取闲置锁定分钟数。
   *
   * 优先级：环境变量 > sys_config > 0（关闭）。
   * 策略放内核，插件停用后依然生效。
   */
  getIdleLockMinutes(): number {
    return this.cachedIdleLockMinutes
  }

  /** 缓存的闲置锁定分钟数（启动时从 sys_config 读入） */
  private cachedIdleLockMinutes = 0

  /** 异步读取闲置锁定策略并缓存 */
  async loadIdleLockPolicy(): Promise<number> {
    if (process.env.VAULT_IDLE_LOCK_MIN !== undefined && process.env.VAULT_IDLE_LOCK_MIN !== '') {
      const n = Number(process.env.VAULT_IDLE_LOCK_MIN)
      this.cachedIdleLockMinutes = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
      return this.cachedIdleLockMinutes
    }
    try {
      const row = await this.configRepo.findOne({ where: { key: IDLE_LOCK_CONFIG_KEY } })
      const n = Number(row?.value ?? 0)
      this.cachedIdleLockMinutes = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
    } catch {
      this.cachedIdleLockMinutes = 0
    }
    return this.cachedIdleLockMinutes
  }

  /** 设置闲置锁定分钟数（写入 sys_config） */
  async setIdleLockMinutes(minutes: number): Promise<{ message: string; minutes: number }> {
    const n = Math.max(0, Math.floor(Number(minutes) || 0))
    const existing = await this.configRepo.findOne({ where: { key: IDLE_LOCK_CONFIG_KEY } })
    if (existing) {
      existing.value = String(n)
      existing.remark = '闲置自动锁定分钟数（0 = 关闭）'
      await this.configRepo.save(existing)
    } else {
      await this.configRepo.save(
        this.configRepo.create({ key: IDLE_LOCK_CONFIG_KEY, value: String(n), remark: '闲置自动锁定分钟数（0 = 关闭）' }),
      )
    }
    this.cachedIdleLockMinutes = n
    this.startIdleTimer()
    return { message: n > 0 ? `闲置 ${n} 分钟后自动锁定` : '已关闭闲置自动锁定', minutes: n }
  }

  /** 记录一次鉴权活动（用于闲置锁定计时） */
  touchActivity(): void {
    this.lastActivityAt = Date.now()
  }

  /** 启动闲置锁定定时器 */
  startIdleTimer(): void {
    this.stopIdleTimer()
    const minutes = this.cachedIdleLockMinutes
    if (!minutes || minutes <= 0) return
    this.idleTimer = setInterval(() => {
      void this.checkIdle()
    }, 30_000)
    this.idleTimer.unref?.()
  }

  /** 停止闲置锁定定时器 */
  stopIdleTimer(): void {
    if (this.idleTimer) {
      clearInterval(this.idleTimer)
      this.idleTimer = null
    }
  }

  /** 闲置检查 */
  private async checkIdle(): Promise<void> {
    const minutes = this.cachedIdleLockMinutes
    if (!minutes || minutes <= 0) return
    if (!isVaultEnabledState()) return
    const idleMs = Date.now() - this.lastActivityAt
    if (idleMs < minutes * 60_000) return
    this.logger.warn(`闲置超过 ${minutes} 分钟，自动锁定`)
    try {
      await this.lock()
    } catch (err) {
      this.logger.error(`自动锁定失败：${(err as Error).message}`)
    }
  }

  // ==================== 内部工具 ====================

  /** 取当前 provider；缺失时抛出明确错误 */
  private requireProvider(meta: VaultMeta | null): VaultProvider {
    const provider = resolveVaultProvider(meta)
    if (!provider) {
      throw new BadRequestException({
        code: 50010,
        message: meta
          ? `缺少 vault provider（${meta.provider}），请恢复插件或用备份恢复数据`
          : '缺少 vault provider，请检查插件安装',
      })
    }
    return provider
  }

  /** 从元数据 + 口令派生 MK（仅在内存中短暂存在） */
  private deriveMkFromMeta(meta: VaultMeta, password: string): Buffer {
    const provider = this.requireProvider(meta)
    return provider.deriveKey(password, meta)
  }

  /** 取当前内存中的 MK（已解锁时可用） */
  private currentMasterKey(_meta: VaultMeta): Buffer {
    const mk = getMasterKey()
    if (!mk) {
      throw new BadRequestException('数据已锁定，请先解锁')
    }
    return mk
  }

  /** 主密码强度校验 */
  private assertPasswordStrength(password: string): void {
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`主密码至少 ${MIN_PASSWORD_LENGTH} 个字符`)
    }
  }

  /** 数据库文件路径 */
  private resolveDatabasePath(): string {
    const raw = process.env.DB_DATABASE || './data/financial.db'
    const resolved = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw)
    if (!fs.existsSync(path.dirname(resolved))) {
      fs.mkdirSync(path.dirname(resolved), { recursive: true })
    }
    return resolved
  }
}
