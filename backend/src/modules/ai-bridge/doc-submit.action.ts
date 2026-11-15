import { BadRequestException, Injectable } from '@nestjs/common'
import type {
  ActionAdapter,
  ActionContext,
  ActionManifest,
  ParamSpec,
  Preview,
} from './protocol'
import type { DocTypeDef } from './doc-type'
import { AiDocTypeResolver } from './doc-type.resolver'
import { assertDraftOnly } from './landing'

/**
 * 通用单据提交（W3）。
 *
 * 存在的意义：消灭「一种单据一个动作适配器」。业务能力从 5 种扩到 40 种时，
 * 模型可见的动作数仍是 10 个左右 —— 单据种类由 `docType` 字段承载，
 * 而不是各占一个动作 id。
 *
 * 本类刻意**不含任何业务语义**，只有三段：
 * 1. 按 docType 取定义（未注册即追问，不猜）；
 * 2. 校验字段属于该类型（越界字段丢弃并留痕）；
 * 3. 委托定义的 preview / submit，并对结果过草稿闸门。
 */
@Injectable()
export class DocSubmitAction implements ActionAdapter {
  /** 参数并集上限：参数表越长模型越容易误填（方案 §9） */
  private static readonly MAX_FIELDS = 12

  constructor(private readonly docTypes: AiDocTypeResolver) {}

  /**
   * manifest 每次读取时重算：`docType` 的枚举值随插件注册动态变化，
   * 缓存一份会让后注册的类型在 prompt 里看不见。
   */
  get manifest(): ActionManifest {
    const types = this.docTypes.list()
    const params: Record<string, ParamSpec> = {
      docType: {
        type: 'enum',
        required: true,
        editable: true,
        label: '单据类型',
        enum: types.map((def) => def.key),
        description: types.length
          ? types.map((def) => `${def.key}=${def.title}`).join('，')
          : '暂无可用单据类型',
      },
      docDate: { type: 'date', label: '单据日期', editable: true, default: 'today' },
      amount: { type: 'number', label: '金额', editable: true, min: 0.01 },
      employeeName: { type: 'string', label: '员工', editable: true, resolve: 'employee' },
      partnerName: { type: 'string', label: '往来单位', editable: true, resolve: 'partner' },
      purpose: { type: 'string', label: '事由', editable: true },
      payMethod: {
        type: 'enum',
        label: '结算方式',
        editable: true,
        enum: ['cash', 'bank'],
        description: 'cash 现金 / bank 银行转账',
      },
      expectedRepayDate: { type: 'date', label: '预计还款日', editable: true },
      remark: { type: 'string', label: '备注', editable: true },
    }
    const keys = Object.keys(params).slice(0, DocSubmitAction.MAX_FIELDS)
    const pruned: Record<string, ParamSpec> = {}
    for (const key of keys) pruned[key] = params[key]

    return {
      id: 'doc.submit',
      title: '办理单据',
      description:
        '按口语提交一张业务单据（借款单、报销单等），字段由单据类型决定；一律生成草稿',
      landing: 'draft',
      group: 'doc',
      params: pruned,
      examples: ['给张三申请借款单，事由备用金，5000', '报销差旅费 1200，李四的', '帮王五提交一张借款单'],
      aliases: ['申请借款单', '借款', '预支', '报销', '提交单据', '办一张单'],
      permission: '@docType',
      amountField: 'amount',
    }
  }

  async preview(args: Record<string, unknown>, ctx: ActionContext): Promise<Preview> {
    // 公司级配置（标题/字段标签/停用）必须在取定义前生效
    await this.docTypes.warm()
    const def = this.resolve(args)
    if (!def) {
      const types = this.docTypes.list()
      return {
        title: '办理单据',
        summary: '还没确定是哪一类单据',
        fields: [],
        lines: [],
        missing: [{ field: 'docType', label: '单据类型' }],
        warnings: [
          types.length
            ? `请说明单据类型：${types.map((item) => item.title).join('、')}`
            : '当前没有可用的单据类型，请先启用对应插件（如人事 hr）',
        ],
      }
    }
    const payload = this.pickFields(args, def)
    const preview = await def.preview(payload, ctx)
    // 单据类型自身的校验结论要合并进统一结构，前端只认一套
    const merged: Preview = {
      ...preview,
      missing: preview.missing ?? [],
      warnings: preview.warnings ?? [],
      fields: preview.fields ?? [],
      lines: preview.lines ?? [],
    }
    return this.applyView(merged, def)
  }

  async commit(args: Record<string, unknown>, ctx: ActionContext): Promise<Record<string, unknown>> {
    await this.docTypes.warm()
    const def = this.resolve(args)
    if (!def) throw new BadRequestException('没说清是哪一类单据，请补充单据类型')

    const payload = this.pickFields(args, def)
    const result = await def.submit(payload, ctx)
    // 第二道闸门：即使插件写错了，也不会把「已生效」的单据交出去
    assertDraftOnly(result, `doc.submit:${def.key}`)
    return result
  }

  /** 按 docType 取定义；未声明 docType 时返回 undefined 交给 preview 追问 */
  private resolve(args: Record<string, unknown>): DocTypeDef | undefined {
    const key = String(args?.docType ?? '').trim()
    if (!key) return undefined
    return this.docTypes.get(key)
  }

  /** 只保留该类型声明过的字段，越界字段直接丢弃（防模型夹带无关参数） */
  private pickFields(args: Record<string, unknown>, def: DocTypeDef): Record<string, unknown> {
    const out: Record<string, unknown> = { docType: def.key }
    for (const key of Object.keys(def.fields)) {
      const value = args?.[key]
      if (value === undefined || value === null || value === '') continue
      out[key] = value
    }
    return out
  }

  /**
   * 把公司配置覆盖到插件产出的卡片上（W7）。
   *
   * 插件的 preview 里字段标签是写死的（它不认识公司配置），所以统一在这里改：
   * - 标题：把默认名替换成配置名（保留「· 张三」这类后缀）；
   * - 字段标签：按 effective fields 覆盖；
   * - 必填：配置成必填但卡片上是空的，补一条缺项。
   *   反向（配置放宽）不生效——缺项是插件自己的业务判断，
   *   硬删会出现「按钮可点、提交仍报错」的更差体验。
   */
  private applyView(preview: Preview, def: DocTypeDef): Preview {
    const base = def.baseTitle
    const title =
      base && base !== def.title && preview.title.includes(base)
        ? preview.title.replace(base, def.title)
        : preview.title

    const labelOf = (key?: string): string | undefined => {
      if (!key) return undefined
      const spec = def.fields[key]
      return spec?.label
    }

    const fields = preview.fields.map((item) => {
      const label = labelOf(item.key)
      return label ? { ...item, label } : item
    })

    const missing = [...preview.missing]
    for (const [key, spec] of Object.entries(def.fields)) {
      if (spec.required !== true) continue
      if (missing.some((item) => item.field === key)) continue
      const shown = fields.find((item) => item.key === key)
      // 没有对应卡片字段的类型不做补判（避免误报）
      if (!shown) continue
      if (String(shown.value ?? '').trim()) continue
      missing.push({ field: key, label: spec.label || key })
    }

    return { ...preview, title, fields, missing }
  }
}
