import { Injectable, Logger } from '@nestjs/common'
import type { DocTypeDef } from './doc-type'

/**
 * 单据类型注册表（W3 / W5）。
 *
 * 各插件在自己的模块里 `register(new LoanDocType(...))`，`doc.submit` 与
 * 权限校验（`permission: '@docType'`）都从这里取定义。
 * 与动作注册表一样：实时读、不缓存、同 key 以先到为准并告警。
 */
@Injectable()
export class AiDocTypeRegistry {
  private readonly logger = new Logger('AiDocTypeRegistry')
  private readonly defs = new Map<string, DocTypeDef>()

  register(def: DocTypeDef): void {
    const key = String(def?.key ?? '').trim()
    if (!key) throw new Error('单据类型注册失败：key 为空')
    if (!def.title) throw new Error(`单据类型「${key}」缺少 title`)
    if (!def.permission) throw new Error(`单据类型「${key}」缺少 permission`)
    if (typeof def.preview !== 'function' || typeof def.submit !== 'function') {
      throw new Error(`单据类型「${key}」必须实现 preview 与 submit`)
    }
    if (this.defs.has(key)) {
      this.logger.warn(`单据类型「${key}」已注册，忽略重复注册（以先到为准）`)
      return
    }
    this.defs.set(key, def)
    this.logger.log(`已注册单据类型 ${key}（${def.plugin} / ${def.permission}）`)
  }

  registerAll(defs: DocTypeDef[]): void {
    for (const def of defs) this.register(def)
  }

  get(key: string): DocTypeDef | undefined {
    return this.defs.get(String(key ?? '').trim())
  }

  has(key: string): boolean {
    return this.defs.has(String(key ?? '').trim())
  }

  list(): DocTypeDef[] {
    return [...this.defs.values()]
  }

  /** 供 prompt 展示的类型摘要：只出 key / 标题 / 字段，不出任何 handler 信息 */
  summary(): Array<{ key: string; title: string; plugin: string; fields: string[] }> {
    return this.list().map((def) => ({
      key: def.key,
      title: def.title,
      plugin: def.plugin,
      fields: Object.keys(def.fields),
    }))
  }

  get size(): number {
    return this.defs.size
  }
}
