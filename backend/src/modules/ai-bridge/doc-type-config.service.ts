import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectCompanyRepo } from '../../common/company/company-repo.decorator'
import type { CompanyScopedRepository } from '../../common/company/company.repository'
import { AiActionAlias, AiDocTypeConfig } from '../../entities/ai-doc.entity'
import { AiDocTypeRegistry } from './doc-type.registry'
import type { ParamSpec } from './protocol'

/** 允许在配置层覆盖的字段属性（其余一律忽略） */
const PATCHABLE_FIELD_KEYS = ['label', 'required', 'description', 'editable'] as const

export interface DocTypeConfigDto {
  key: string
  title?: string
  permission?: string
  enabled?: boolean | number
  fields?: Record<string, Partial<ParamSpec>>
}

export interface AliasDto {
  docTypeKey?: string
  alias: string
  sampleText?: string
  sampleArgs?: Record<string, unknown> | string
}

/**
 * 单据类型声明式配置（W7）。
 *
 * 只负责「读写配置表 + 校验」，不参与执行：
 * - 类型必须已由插件注册（新增类型仍要发版注册 handler）；
 * - 字段必须在类型自己的 `fields` 白名单里；
 * - 存进去的只有展示与别名，没有任何 handler / URL / SQL 字段。
 */
@Injectable()
export class AiDocTypeConfigService {
  constructor(
    @InjectCompanyRepo(AiDocTypeConfig)
    private readonly types: CompanyScopedRepository<AiDocTypeConfig>,
    @InjectCompanyRepo(AiActionAlias)
    private readonly aliases: CompanyScopedRepository<AiActionAlias>,
    private readonly registry: AiDocTypeRegistry,
  ) {}

  async load(): Promise<{ overrides: AiDocTypeConfig[]; aliases: AiActionAlias[] }> {
    const [overrides, aliases] = await Promise.all([
      this.types.find({}) as Promise<AiDocTypeConfig[]>,
      this.aliases.find({}) as Promise<AiActionAlias[]>,
    ])
    return { overrides, aliases }
  }

  /** 配置列表（含插件默认值与是否已被覆盖），供界面展示 */
  async list(): Promise<
    Array<{
      key: string
      plugin: string
      title: string
      permission: string
      enabled: boolean
      overridden: boolean
      fields: Array<{ key: string; label: string; required: boolean; description?: string }>
      aliases: Array<{ id: string; alias: string; sampleText: string | null }>
    }>
  > {
    const { overrides, aliases } = await this.load()
    const overrideMap = new Map(overrides.map((row) => [row.key, row]))
    const aliasMap = new Map<string, AiActionAlias[]>()
    for (const row of aliases) {
      const list = aliasMap.get(row.docTypeKey) ?? []
      list.push(row)
      aliasMap.set(row.docTypeKey, list)
    }

    return this.registry.list().map((def) => {
      const override = overrideMap.get(def.key)
      const fieldPatch = parseFields(override?.fieldsJson)
      return {
        key: def.key,
        plugin: def.plugin,
        title: override?.title || def.title,
        permission: override?.permission || def.permission,
        enabled: override ? Number(override.enabled) === 1 : true,
        overridden: !!override,
        fields: Object.entries(def.fields).map(([key, spec]) => ({
          key,
          label: fieldPatch[key]?.label || spec.label || key,
          required: fieldPatch[key]?.required ?? spec.required === true,
          description: fieldPatch[key]?.description || spec.description,
        })),
        aliases: (aliasMap.get(def.key) ?? []).map((row) => ({
          id: row.id,
          alias: row.alias,
          sampleText: row.sampleText,
        })),
      }
    })
  }

  /** 新增或更新某个类型的展示配置 */
  async upsert(dto: DocTypeConfigDto): Promise<AiDocTypeConfig> {
    const key = String(dto?.key ?? '').trim()
    const def = this.registry.get(key)
    if (!def) throw new BadRequestException(`单据类型「${key}」未注册，需先在插件里实现后才能配置`)

    const fields = this.validateFields(def.fields, dto?.fields)
    const existing = (await this.types.findOne({ where: { key } })) as AiDocTypeConfig | null

    const payload: Partial<AiDocTypeConfig> = {
      key,
      plugin: def.plugin,
      title: (dto.title ?? existing?.title ?? def.title).slice(0, 60),
      permission: (dto.permission ?? existing?.permission ?? def.permission).slice(0, 80),
      enabled: dto.enabled === undefined ? (existing?.enabled ?? 1) : Number(dto.enabled) ? 1 : 0,
      ...(fields ? { fieldsJson: JSON.stringify(fields) } : {}),
    }

    if (existing) {
      await this.types.update({ id: existing.id }, payload)
      return (await this.types.findOne({ where: { id: existing.id } })) as AiDocTypeConfig
    }
    return (await this.types.save(this.types.create(payload))) as AiDocTypeConfig
  }

  /** 恢复插件默认（删除覆盖行，别名保留） */
  async removeOverride(key: string): Promise<void> {
    await this.types.delete({ key })
  }

  async addAlias(dto: AliasDto): Promise<AiActionAlias> {
    const alias = String(dto?.alias ?? '').trim()
    if (!alias) throw new BadRequestException('别名不能为空')
    const docTypeKey = String(dto?.docTypeKey ?? 'doc.submit').trim() || 'doc.submit'
    if (docTypeKey !== 'doc.submit' && !this.registry.has(docTypeKey)) {
      throw new BadRequestException(`单据类型「${docTypeKey}」未注册，不能挂别名`)
    }
    const payload = {
      docTypeKey,
      alias: alias.slice(0, 50),
      sampleText: dto.sampleText ? String(dto.sampleText).slice(0, 200) : null,
      sampleArgs: dto.sampleArgs
        ? typeof dto.sampleArgs === 'string'
          ? dto.sampleArgs
          : JSON.stringify(dto.sampleArgs)
        : null,
    }
    return (await this.aliases.save(this.aliases.create(payload))) as AiActionAlias
  }

  async removeAlias(id: string): Promise<void> {
    await this.aliases.delete({ id })
  }

  /** 字段覆盖只能落在该类型已声明的字段上 */
  private validateFields(
    allowed: Record<string, ParamSpec>,
    patch?: Record<string, Partial<ParamSpec>>,
  ): Record<string, Partial<ParamSpec>> | undefined {
    if (!patch || typeof patch !== 'object') return undefined
    const out: Record<string, Partial<ParamSpec>> = {}
    for (const [key, value] of Object.entries(patch)) {
      if (!allowed[key]) {
        throw new BadRequestException(`字段「${key}」不属于该单据类型，不能新增字段`)
      }
      const picked: Record<string, unknown> = {}
      for (const prop of PATCHABLE_FIELD_KEYS) {
        if (value?.[prop] !== undefined) picked[prop] = value[prop]
      }
      if (Object.keys(picked).length) out[key] = picked as Partial<ParamSpec>
    }
    return Object.keys(out).length ? out : undefined
  }
}

export function parseFields(json: string | null | undefined): Record<string, Partial<ParamSpec>> {
  if (!json) return {}
  try {
    const parsed = JSON.parse(json)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}
