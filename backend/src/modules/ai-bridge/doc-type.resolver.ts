import { Injectable, Logger } from '@nestjs/common'
import { getCompanyContext } from '../../common/company/company-context'
import type { AiDocTypeConfig } from '../../entities/ai-doc.entity'
import { AiDocTypeRegistry } from './doc-type.registry'
import { AiDocTypeConfigService, parseFields } from './doc-type-config.service'
import type { DocTypeDef } from './doc-type'

const TTL_MS = 10_000

export interface ResolvedAlias {
  docTypeKey: string
  alias: string
  sampleText: string | null
  sampleArgs: Record<string, unknown> | null
}

interface Snapshot {
  at: number
  defs: Map<string, DocTypeDef>
  aliases: ResolvedAlias[]
}

/**
 * 单据类型的「插件默认值 + 当前公司配置」合并层（W7）。
 *
 * 为什么需要这一层：动作注册表是进程级单例，而配置是公司级数据。
 * 合并必须发生在**请求期**（有公司上下文时），不能塞进注册表，
 * 否则 A 公司的别名会漏给 B 公司。
 *
 * 读取走 10 秒过期的小缓存：plan/commit 前 `warm()` 一次，
 * 之后的同步读取（manifest 枚举、权限码解析）都用同一份快照。
 */
@Injectable()
export class AiDocTypeResolver {
  private readonly logger = new Logger('AiDocTypeResolver')
  private readonly cache = new Map<string, Snapshot>()

  constructor(
    private readonly registry: AiDocTypeRegistry,
    private readonly config: AiDocTypeConfigService,
  ) {}

  /** 请求期预热：无公司上下文（启动/系统接口）时直接跳过 */
  async warm(force = false): Promise<void> {
    const companyId = getCompanyContext()?.companyId
    if (!companyId) return
    const cached = this.cache.get(companyId)
    if (!force && cached && Date.now() - cached.at < TTL_MS) return
    try {
      const { overrides, aliases } = await this.config.load()
      this.cache.set(companyId, {
        at: Date.now(),
        defs: this.merge(overrides),
        aliases: aliases.map((row) => ({
          docTypeKey: row.docTypeKey,
          alias: row.alias,
          sampleText: row.sampleText,
          sampleArgs: safeParse(row.sampleArgs),
        })),
      })
    } catch (err) {
      // 配置读失败不能拖垮指令链路：退化为插件默认值
      this.logger.warn(`读取单据类型配置失败，使用插件默认值：${(err as Error).message}`)
    }
  }

  /** 当前公司的有效类型（已过滤停用项） */
  list(): DocTypeDef[] {
    const snapshot = this.snapshot()
    return snapshot ? [...snapshot.defs.values()] : this.registry.list()
  }

  get(key: string): DocTypeDef | undefined {
    const snapshot = this.snapshot()
    if (!snapshot) return this.registry.get(key)
    return snapshot.defs.get(String(key ?? '').trim())
  }

  has(key: string): boolean {
    return !!this.get(key)
  }

  /** 当前公司的口语别名与样本（供召回打分与 few-shot） */
  aliases(): ResolvedAlias[] {
    return this.snapshot()?.aliases ?? []
  }

  /**
   * 配置变更后立即失效。
   *
   * 故意清**全部**而不是只清当前公司：写配置的请求与随后跑指令的请求
   * 未必落在同一个公司上下文（切换公司、后台任务），只清当家的那份
   * 会留下「刚改完不生效」的窗口。配置写入是低频操作，全清没有代价。
   */
  invalidate(): void {
    this.cache.clear()
  }

  private snapshot(): Snapshot | undefined {
    const companyId = getCompanyContext()?.companyId
    return companyId ? this.cache.get(companyId) : undefined
  }

  private merge(overrides: AiDocTypeConfig[]): Map<string, DocTypeDef> {
    const map = new Map<string, DocTypeDef>()
    const byKey = new Map(overrides.map((row) => [row.key, row]))

    for (const def of this.registry.list()) {
      const override = byKey.get(def.key)
      if (!override) {
        map.set(def.key, def)
        continue
      }
      if (Number(override.enabled) === 0) continue

      const fieldPatch = parseFields(override.fieldsJson)
      const fields = { ...def.fields }
      for (const [key, patch] of Object.entries(fieldPatch)) {
        if (!fields[key]) continue
        fields[key] = { ...fields[key], ...patch }
      }

      map.set(def.key, {
        // 只覆盖展示与权限，执行函数仍绑在原实现上
        ...def,
        title: override.title || def.title,
        baseTitle: def.title,
        permission: override.permission || def.permission,
        fields,
        preview: def.preview.bind(def),
        submit: def.submit.bind(def),
      })
    }
    return map
  }
}

function safeParse(value: string | null): Record<string, unknown> | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}
