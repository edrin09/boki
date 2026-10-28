/**
 * 远程插件市场客户端（对接独立服务端 boki-market）。
 *
 * 职责（接入说明 8：安装时序落地）：
 *   拉索引（ETag + 本地缓存）→ 验签 → 防回滚 → 目录合并安装状态
 *   → 下载 → sha256 校验 → 安全解包 → 依赖优先安装 → 原子落目录 → 写 state
 *
 * 失败降级：市场不可达时用 backend/data/market-cache 里最近一次成功拉取的索引；
 * 缓存也没有才报错。插件读取 / 菜单 / 资源托管仍由 PluginsService 负责，本服务不碰运行时。
 */
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  ensureDir,
  marketCacheDir,
  pluginsRootDir,
  readJson,
  writeJson,
} from '../plugin.paths'
import { markSyncRequired, readState, setEntry } from '../plugin.state'
import { readInstalledManifest } from '../plugin.loader'
import { PluginManifest } from '../plugin.types'
import { PluginsService } from '../plugins.service'
import { assertSafeEntryName, readZip } from './zip-buffer'
import type {
  RemoteCatalogResponse,
  RemoteCatalogRow,
  RemoteIndex,
  RemoteIndexMeta,
  RemoteIndexPlugin,
} from './remote-market.types'

const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9-]*$/
const INDEX_RAW_FILE = 'index.raw.json'
const INDEX_META_FILE = 'index.meta.json'
const FETCH_TIMEOUT_MS = 15_000

/** Ed25519 raw 32 字节公钥 → SPKI DER 包装 */
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

export interface FetchIndexResult {
  index: RemoteIndex
  source: 'remote' | 'cache'
  verified: boolean
  degraded?: boolean
  error?: string
}

@Injectable()
export class RemoteMarketService {
  private readonly logger = new Logger(RemoteMarketService.name)

  /** keyId → Node KeyObject（Ed25519 公钥）；模块加载时解析，配置错误直接启动失败 */
  private readonly publicKeys = parsePublicKeys(process.env.PLUGIN_MARKET_PUBLIC_KEYS)

  private readonly baseUrl = normalizeBaseUrl(process.env.PLUGIN_MARKET_URL)

  constructor(private readonly localPlugins: PluginsService) {}

  // ==================== 状态 ====================

  isEnabled(): boolean {
    return !!this.baseUrl
  }

  async status(): Promise<{
    enabled: boolean
    url?: string
    market?: string
    snapshotVersion?: number
    publishedAt?: string
    snapshotStale?: boolean
    publicKeysConfigured?: boolean
  }> {
    if (!this.isEnabled()) return { enabled: false }
    const info: Awaited<ReturnType<RemoteMarketService['status']>> = {
      enabled: true,
      url: this.baseUrl!,
      publicKeysConfigured: this.publicKeys.size > 0,
    }
    try {
      const res = await request(`${this.baseUrl}/v1/health`)
      const body = (await res.json()) as {
        ok?: boolean
        market?: string
        snapshot?: {
          active?: boolean
          version?: number
          publishedAt?: string | null
          stale?: boolean
        }
      }
      info.market = body.market
      info.snapshotVersion = body.snapshot?.version ?? undefined
      info.publishedAt = body.snapshot?.publishedAt ?? undefined
      info.snapshotStale = body.snapshot?.stale
    } catch (error) {
      // health 失败不代表客户端不可用；目录请求还有本地缓存兜底
      this.logger.warn(`市场健康检查失败：${asMessage(error)}`)
    }
    return info
  }

  // ==================== 索引 ====================

  /** 拉取并验签索引；市场不可达时回退本地缓存（degraded） */
  async fetchIndex(): Promise<FetchIndexResult> {
    if (!this.baseUrl) {
      throw new BadRequestException('未配置 PLUGIN_MARKET_URL，远程插件市场不可用')
    }

    const meta = this.readCacheMeta()
    try {
      const res = await request(`${this.baseUrl}/v1/index`, {
        headers: meta?.etag ? { 'if-none-match': meta.etag } : undefined,
      })

      if (res.status === 304 && meta?.signature) {
        const cache = this.readCache()
        if (cache) {
          const { index, verified } = this.verifyIndex(cache.raw, cache.meta.keyId, cache.meta.signature)
          return { index, source: 'cache', verified }
        }
      }

      if (res.status !== 200) {
        const cache = this.readCache()
        if (cache) {
          const { index, verified } = this.verifyIndex(cache.raw, cache.meta.keyId, cache.meta.signature)
          return {
            index,
            source: 'cache',
            verified,
            degraded: true,
            error: `市场返回 ${res.status}，使用本地缓存`,
          }
        }
        throw new BadRequestException(`拉取插件市场索引失败：HTTP ${res.status}`)
      }

      const raw = Buffer.from(await res.arrayBuffer())
      const keyId = header(res, 'x-boki-key-id')
      const signature = header(res, 'x-boki-signature')
      const { index, verified } = this.verifyIndex(raw, keyId, signature)

      // 防回滚：publishedAt 更旧不采纳
      const seen = meta?.seenPublishedAt
      if (seen && index.publishedAt && index.publishedAt < seen) {
        const cache = this.readCache()
        if (cache) {
          const cachedIndex = this.verifyIndex(cache.raw, cache.meta.keyId, cache.meta.signature)
          return {
            index: cachedIndex.index,
            source: 'cache',
            verified: cachedIndex.verified,
            degraded: true,
            error: '检测到更旧的索引快照，已拒绝并使用本地缓存',
          }
        }
        throw new BadRequestException('检测到更旧的索引快照，已拒绝（防回滚）')
      }

      this.writeCache(raw, {
        ...meta,
        url: this.baseUrl,
        etag: header(res, 'etag') ?? meta?.etag,
        keyId: keyId ?? meta?.keyId,
        signature: signature ?? meta?.signature,
        seenPublishedAt: latestTimestamp(seen, index.publishedAt),
        fetchedAt: new Date().toISOString(),
      })
      return { index, source: 'remote', verified }
    } catch (error) {
      if (error instanceof BadRequestException) throw error

      // 网络层 / 数据层失败 → 本地缓存兜底
      const message = asMessage(error)
      const cache = this.readCache()
      if (cache) {
        const { index, verified } = this.verifyIndex(cache.raw, cache.meta.keyId, cache.meta.signature)
        return {
          index,
          source: 'cache',
          verified,
          degraded: true,
          error: `市场暂不可达（${message}），使用本地缓存`,
        }
      }
      throw new BadRequestException(`无法访问插件市场且没有本地缓存：${message}`)
    }
  }

  /**
   * 统一的「验签 + 解析」：
   * - 配置了 PLUGIN_MARKET_PUBLIC_KEYS：必须携带有效签名，否则拒绝（防伪造市场）
   * - 未配置：只做传输层保护并告警（verified=false），不阻塞 P4 联调；生产必须配置
   */
  private verifyIndex(
    raw: Buffer,
    keyId?: string,
    signature?: string,
  ): { index: RemoteIndex; verified: boolean } {
    // 未配置公钥：不验签，只告警（留空 = 仅传输层保护，见 .env 说明）
    if (this.publicKeys.size === 0) {
      this.logger.warn(
        `未配置 PLUGIN_MARKET_PUBLIC_KEYS，跳过索引验签（服务端 keyId=${keyId ?? '无'}）`,
      )
      return { index: this.parseIndex(raw), verified: false }
    }
    if (!keyId || !signature) {
      throw new BadRequestException('插件市场未返回签名，拒绝处理（已配置验签公钥）')
    }
    const publicKey = this.publicKeys.get(keyId)
    if (!publicKey) {
      throw new BadRequestException(`未知的签名公钥 keyId：${keyId}`)
    }
    const ok = crypto.verify(null, raw, publicKey, Buffer.from(signature, 'base64'))
    if (!ok) {
      throw new BadRequestException('插件市场索引签名校验失败，已拒绝处理')
    }
    this.logger.log(`插件市场索引验签通过 keyId=${keyId}`)
    return { index: this.parseIndex(raw), verified: true }
  }

  private parseIndex(raw: Buffer): RemoteIndex {
    try {
      const index = JSON.parse(raw.toString('utf8')) as RemoteIndex
      if (!index || !Array.isArray(index.plugins)) throw new Error('缺少 plugins 数组')
      return index
    } catch (error) {
      throw new BadRequestException(`插件市场索引不是合法 JSON：${asMessage(error)}`)
    }
  }

  // ==================== 目录 ====================

  async remoteCatalog(): Promise<RemoteCatalogResponse> {
    const { index, source, verified, degraded, error } = await this.fetchIndex()
    const state = readState()
    const plugins = index.plugins.map((item) => this.toRow(item, state.plugins[item.id]))
    return {
      source,
      verified,
      degraded,
      error,
      market: index.market,
      publishedAt: index.publishedAt,
      version: index.version,
      categories: index.categories ?? [],
      plugins,
    }
  }

  private toRow(
    item: RemoteIndexPlugin,
    entry: ReturnType<typeof readState>['plugins'][string] | undefined,
  ): RemoteCatalogRow {
    const installedManifest = entry ? readInstalledManifest(item.id) : null
    const installedVersion = installedManifest?.version ?? entry?.version
    return {
      manifest: {
        id: item.id,
        name: item.name,
        version: item.version,
        apiVersion: item.apiVersion,
        engines: item.engines,
        trust: item.trust,
        license: item.license,
        description: item.description,
        kind: item.category,
        permissions: [],
        contributes: {},
      },
      installed: !!entry,
      enabled: !!entry?.enabled,
      installedVersion,
      hasUpdate: !!entry && !!installedVersion && compareVersion(item.version, installedVersion) > 0,
      category: item.category,
      categories: item.categories,
      price: item.price,
      currency: item.currency,
      download: item.download,
      sha256: item.sha256,
      size: item.size,
    }
  }

  // ==================== 安装 ====================

  /**
   * 从远程市场安装 / 更新插件（依赖优先，走索引白名单）。
   * 文件落在与本地安装同一份 data/plugins 里，启停/卸载/菜单逻辑全部复用。
   */
  async install(
    id: string,
    licenseKey?: string,
  ): Promise<{ id: string; installed: string[]; restartRequired: true }> {
    this.assertId(id)
    if (!this.baseUrl) {
      throw new BadRequestException('未配置 PLUGIN_MARKET_URL，远程插件市场不可用')
    }

    const { index } = await this.fetchIndex()
    const installed: string[] = []
    await this.installRecursive(index, id, installed, new Set(), licenseKey)
    markSyncRequired()
    return { id, installed, restartRequired: true }
  }

  private async installRecursive(
    index: RemoteIndex,
    id: string,
    installed: string[],
    visiting: Set<string>,
    licenseKey?: string,
  ): Promise<void> {
    if (visiting.has(id)) throw new BadRequestException(`插件依赖存在循环：${id}`)
    visiting.add(id)

    try {
      const entry = readState().plugins[id]
      const item = index.plugins.find((candidate) => candidate.id === id)
      if (!item) throw new NotFoundException(`远程市场中没有插件 ${id}`)

      // 已是同版本：确保启用，不重复下载
      const installedManifest = readInstalledManifest(id)
      if (installedManifest && entry && installedManifest.version === item.version) {
        setEntry(id, { ...entry, enabled: true })
        if (!installed.includes(id)) installed.push(id)
        return
      }

      // 下载 + sha256 + 安全解包到临时目录
      const zip = await this.downloadZip(item, licenseKey)
      const tmpDir = await this.unpack(zip, id)

      try {
        const manifest = this.readUnpackedManifest(tmpDir, id)
        this.validateManifest(manifest)

        // 硬依赖先装：远程市场没有 → 退回本地插件源（boki-market/plugins）
        for (const dep of Object.keys(manifest.dependencies ?? {})) {
          const depEntry = readState().plugins[dep]
          const depItem = index.plugins.find((candidate) => candidate.id === dep)
          if (depEntry?.version && depEntry.version === depItem?.version) continue
          if (depItem?.version) {
            await this.installRecursive(index, dep, installed, visiting, licenseKey)
          } else {
            await this.installLocalFallback(dep, installed)
          }
        }

        // 原子提交：旧版先改名备份 → 新目录就位 → 成功后删除备份
        const target = path.join(pluginsRootDir(), id)
        const backupDir = fs.existsSync(target) ? `${target}.bak-${Date.now()}` : null
        if (backupDir) fs.renameSync(target, backupDir)
        try {
          fs.renameSync(tmpDir, target)
          if (backupDir) fs.rmSync(backupDir, { recursive: true, force: true })
        } catch (error) {
          if (backupDir && !fs.existsSync(target)) fs.renameSync(backupDir, target)
          throw error
        }

        const stateAfter = readState()
        setEntry(id, {
          enabled: stateAfter.plugins[id]?.enabled ?? true,
          version: manifest.version,
          installedAt: stateAfter.plugins[id]?.installedAt ?? new Date().toISOString(),
        })
        this.logger.log(`${entry ? '已更新' : '已安装'}远程插件 ${id}@${manifest.version}`)
        if (!installed.includes(id)) installed.push(id)
      } finally {
        // rename 成功后 tmpDir 已不在原地；失败时把临时目录清掉
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true })
      }
    } finally {
      visiting.delete(id)
    }
  }

  /** 远程没有该依赖时的本地降级：退回本地插件源安装 */
  private async installLocalFallback(dep: string, installed: string[]): Promise<void> {
    this.logger.warn(`远程市场缺少插件 ${dep}，退回本地插件目录安装`)
    await this.localPlugins.install(dep)
    if (!installed.includes(dep)) installed.push(dep)
  }

  // ==================== 下载与解包 ====================

  private async downloadZip(item: RemoteIndexPlugin, licenseKey?: string): Promise<Buffer> {
    if (item.price && item.price > 0 && !licenseKey) {
      throw new BadRequestException(`插件 ${item.id} 是收费插件，需要提供授权码`)
    }

    let url = item.download
    if (!/^https?:\/\//i.test(url)) url = new URL(url, this.baseUrl!).toString()
    if (licenseKey) {
      url += (url.includes('?') ? '&' : '?') + `license=${encodeURIComponent(licenseKey)}`
    }

    const res = await request(url)
    if (res.status === 402) throw new BadRequestException('授权码无效或已失效（市场返回 402）')
    if (res.status !== 200) throw new BadRequestException(`下载插件包失败：HTTP ${res.status}`)

    const buffer = Buffer.from(await res.arrayBuffer())
    if (item.sha256) {
      const hash = crypto.createHash('sha256').update(buffer).digest('hex')
      if (hash !== item.sha256.toLowerCase()) {
        this.logger.error(`下载完整性校验失败 ${item.id}：sha256 ${hash} != ${item.sha256}`)
        throw new BadRequestException('插件包完整性校验失败（sha256 不匹配），已中止安装')
      }
    }
    return buffer
  }

  /** 校验通过的 zip 解包到临时目录（带路径穿越防护），返回目录路径 */
  private async unpack(zip: Buffer, id: string): Promise<string> {
    const tmpDir = path.join(pluginsRootDir(), `.tmp-${id}-${Date.now()}`)
    ensureDir(tmpDir)
    try {
      const entries = readZip(zip)
      for (const [name, data] of entries) {
        if (name.endsWith('/')) continue
        assertSafeEntryName(name)
        const target = path.resolve(tmpDir, name)
        if (!target.startsWith(path.resolve(tmpDir) + path.sep)) {
          throw new BadRequestException(`插件包内出现非法路径：${name}`)
        }
        ensureDir(path.dirname(target))
        fs.writeFileSync(target, data)
      }
    } catch (error) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      throw new BadRequestException(`插件包解压失败：${asMessage(error)}`)
    }
    return tmpDir
  }

  private readUnpackedManifest(dir: string, id: string): PluginManifest {
    const manifest = readJson<PluginManifest>(path.join(dir, 'manifest.json'))
    if (!manifest?.id) throw new BadRequestException(`插件 ${id} 的包内缺少有效 manifest.json`)
    if (manifest.id !== id) {
      throw new BadRequestException(
        `包内 manifest.id（${manifest.id}）与索引登记（${id}）不一致，已拒绝安装`,
      )
    }
    return manifest
  }

  private validateManifest(manifest: PluginManifest): void {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(manifest.id)) throw new BadRequestException('manifest.id 非法')
    if (!manifest.version) throw new BadRequestException('manifest.version 缺失')
    if (!manifest.apiVersion || !/^\^?1(\.|$)/.test(manifest.apiVersion)) {
      throw new BadRequestException(`插件 apiVersion 与内核不兼容：${manifest.apiVersion}`)
    }
    if (manifest.scopeMode === 'global' && manifest.trust !== 'official') {
      throw new BadRequestException('scopeMode=global 仅允许 official 插件')
    }
  }

  // ==================== 缓存 ====================

  private readCacheMeta(): RemoteIndexMeta | null {
    return readJson<RemoteIndexMeta>(path.join(marketCacheDir(), INDEX_META_FILE))
  }

  private readCacheRaw(): string | null {
    const file = path.join(marketCacheDir(), INDEX_RAW_FILE)
    if (!fs.existsSync(file)) return null
    try {
      return fs.readFileSync(file, 'utf8')
    } catch {
      return null
    }
  }

  /** 读缓存：任一文件缺失或损坏 → null（不降级到空） */
  private readCache(): { raw: Buffer; meta: RemoteIndexMeta } | null {
    const cache = this.readCacheRaw()
    const meta = this.readCacheMeta()
    if (!cache || !meta) return null
    return { raw: Buffer.from(cache, 'utf8'), meta }
  }

  private writeCache(raw: Buffer, meta: RemoteIndexMeta): void {
    const dir = marketCacheDir()
    ensureDir(dir)
    writeJson(path.join(dir, INDEX_META_FILE), meta)
    fs.writeFileSync(path.join(dir, INDEX_RAW_FILE), raw)
  }

  private assertId(id: string): void {
    if (!PLUGIN_ID_RE.test(id)) throw new BadRequestException('非法插件 ID')
  }
}

// ==================== 工具 ====================

async function request(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
}

function header(res: Response, name: string): string | undefined {
  const value = res.headers.get(name)
  return value === null || value === '' ? undefined : value
}

function normalizeBaseUrl(value: string | undefined): string | null {
  const raw = (value ?? '').trim()
  if (!raw) return null
  return raw.replace(/\/+$/, '')
}

function parsePublicKeys(raw: string | undefined): Map<string, crypto.KeyObject> {
  const map = new Map<string, crypto.KeyObject>()
  for (const part of (raw ?? '').split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const sep = trimmed.indexOf(':')
    if (sep <= 0) {
      throw new Error(`PLUGIN_MARKET_PUBLIC_KEYS 格式非法：${trimmed}（应为 keyId:<raw-base64>）`)
    }
    const keyId = trimmed.slice(0, sep).trim()
    const base64 = trimmed.slice(sep + 1).trim()
    const rawKey = Buffer.from(base64, 'base64')
    if (rawKey.length !== 32) {
      throw new Error(`PLUGIN_MARKET_PUBLIC_KEYS 的 ${keyId} 不是 32 字节 raw Ed25519 公钥`)
    }
    const spki = Buffer.concat([SPKI_PREFIX, rawKey])
    map.set(keyId, crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' }))
  }
  return map
}

/** 语义化版本比较（缺段补 0）；> 0 表示 a 更新 */
export function compareVersion(a: string, b: string): number {
  const clean = (value: string) =>
    value
      .split(/[+-]/, 1)[0]
      .split('.')
      .map((seg) => Number.parseInt(seg, 10) || 0)
  const left = clean(String(a ?? ''))
  const right = clean(String(b ?? ''))
  const length = Math.max(left.length, right.length, 3)
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

function latestTimestamp(a?: string, b?: string): string | undefined {
  if (!a) return b
  if (!b) return a
  return a >= b ? a : b
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
