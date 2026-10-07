import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Receipt } from '../../entities/receipt.entity'
import { ClassifyRule } from '../../entities/classify-rule.entity'
import { Partner } from '../../entities/partner.entity'
import { Account } from '../../entities/account.entity'
import { Voucher } from '../../entities/voucher.entity'
import { VoucherEntry } from '../../entities/voucher-entry.entity'
import {
  PartnerType,
  ReceiptStatus,
  VoucherStatus,
  VoucherWord,
} from '../../common/enums'
import { toCents, fromCents } from '../../common/utils/money.util'
import { CODE_PREFIX, nextCode } from '../../common/utils/code.util'
import { VouchersService } from '../vouchers/vouchers.service'
import { ClassifyService, ClassifySuggestion, DraftEntryTemplate } from './classify.service'
import type { RejectReceiptDto, UpdateDraftDto } from './dto/workbench.dto'

export interface Operator {
  id: string
  nickname: string
}

/**
 * 待确认工作台（P17.4 / P17.6）：
 * 草稿生成（复用凭证服务，借贷平衡）、修改科目、确认入账、驳回、修正回写。
 */
@Injectable()
export class ReceiptWorkbenchService {
  private readonly logger = new Logger('ReceiptWorkbenchService')

  constructor(
    @InjectRepository(Receipt) private readonly receiptRepo: Repository<Receipt>,
    @InjectRepository(ClassifyRule) private readonly ruleRepo: Repository<ClassifyRule>,
    @InjectRepository(Partner) private readonly partnerRepo: Repository<Partner>,
    @InjectRepository(Account) private readonly accountRepo: Repository<Account>,
    @InjectRepository(Voucher) private readonly voucherRepo: Repository<Voucher>,
    @InjectRepository(VoucherEntry) private readonly entryRepo: Repository<VoucherEntry>,
    private readonly classify: ClassifyService,
    private readonly vouchers: VouchersService,
  ) {}

  // ==================== 查询 ====================

  /** 待确认列表：已解析 + 已生成草稿（展示建议与草稿分录，不计数命中） */
  async pendingList(query: { page?: number; pageSize?: number }): Promise<any> {
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20))
    const qb = this.receiptRepo
      .createQueryBuilder('r')
      .where('r.status IN (:...statuses)', {
        statuses: [ReceiptStatus.PARSED, ReceiptStatus.DRAFTED],
      })
      .orderBy('r.createdAt', 'DESC')

    const [rows, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount()

    const items: any[] = []
    for (const r of rows) items.push(await this.enrich(r))
    return { items, total, page, pageSize }
  }

  /** 工作台详情（含归类建议与凭证草稿） */
  async detail(id: string): Promise<any> {
    const receipt = await this.findEntity(id)
    return this.enrich(receipt)
  }

  // ==================== 草稿 ====================

  /** 生成/覆盖凭证草稿：归类 → 解析科目与对手方 → 复用凭证服务创建（不审核） */
  async generateDraft(id: string, operator: Operator): Promise<any> {
    const receipt = await this.findEntity(id)
    this.assertDraftable(receipt)

    const suggestion = await this.classify.suggest(receipt)
    if (!suggestion.entries.length) {
      throw new BadRequestException(suggestion.message ?? '该票据无法自动归类，请完善公司信息或归类规则')
    }

    const entries = await this.buildEntries(receipt, suggestion)
    const voucherDate = receipt.issueDate ?? new Date().toISOString().slice(0, 10)
    const remark = `票据自动生成（${receipt.fileName}）`

    if (receipt.voucherId) {
      const linked = await this.voucherRepo.findOne({ where: { id: receipt.voucherId } })
      if (linked && linked.status !== VoucherStatus.DRAFT) {
        throw new BadRequestException('关联凭证已审核或作废，不能重新生成草稿')
      }
      await this.vouchers.update(
        linked.id,
        { word: VoucherWord.GENERAl, voucherDate, entries, remark },
        operator,
        false,
      )
    } else {
      const voucher = await this.vouchers.create(
        { word: VoucherWord.GENERAl, voucherDate, entries, remark },
        operator,
        false,
      )
      receipt.voucherId = voucher.id
    }

    receipt.status = ReceiptStatus.DRAFTED
    await this.receiptRepo.save(receipt)
    return this.detail(id)
  }

  /** 修改草稿分录（改科目/改金额），仅草稿状态可改 */
  async updateDraft(id: string, dto: UpdateDraftDto, operator: Operator): Promise<any> {
    const receipt = await this.findEntity(id)
    if (receipt.status !== ReceiptStatus.DRAFTED || !receipt.voucherId) {
      throw new BadRequestException('请先生成凭证草稿')
    }
    const linked = await this.voucherRepo.findOne({ where: { id: receipt.voucherId } })
    if (!linked || linked.status !== VoucherStatus.DRAFT) {
      throw new BadRequestException('关联凭证状态异常，无法修改')
    }

    const voucherDate = dto.voucherDate ?? receipt.issueDate ?? linked.voucherDate
    await this.vouchers.update(
      linked.id,
      { word: VoucherWord.GENERAl, voucherDate, entries: dto.entries, remark: linked.remark },
      operator,
      false,
    )
    return this.detail(id)
  }

  // ==================== 确认 / 驳回 ====================

  /** 确认入账：审核关联草稿凭证 + 状态流转 + 修正回写 */
  async confirm(id: string, operator: Operator): Promise<any> {
    const receipt = await this.findEntity(id)
    if (receipt.status !== ReceiptStatus.DRAFTED || !receipt.voucherId) {
      throw new BadRequestException('该票据没有待确认的凭证草稿，请先生成草稿')
    }
    const linked = await this.voucherRepo.findOne({ where: { id: receipt.voucherId } })
    if (!linked || linked.status !== VoucherStatus.DRAFT) {
      throw new BadRequestException('关联凭证状态异常，无法确认入账')
    }

    await this.vouchers.approve(linked.id, operator)

    receipt.status = ReceiptStatus.CONFIRMED
    receipt.confirmedBy = operator.id
    receipt.confirmedByName = operator.nickname
    receipt.confirmedAt = new Date()
    await this.receiptRepo.save(receipt)

    // P17.6：确认前用户改过科目 → 按交易对手自动记入规则
    await this.learnFromCorrection(receipt)

    return this.detail(id)
  }

  /** 批量确认（逐条独立，部分失败不影响其他） */
  async confirmBatch(ids: string[], operator: Operator): Promise<any> {
    const results: Array<{ id: string; success: boolean; message: string }> = []
    for (const id of ids) {
      try {
        await this.confirm(id, operator)
        results.push({ id, success: true, message: '已确认入账' })
      } catch (err) {
        results.push({ id, success: false, message: (err as Error).message })
      }
    }
    const success = results.filter((r) => r.success).length
    return { success, failed: results.length - success, results }
  }

  /** 驳回：删除草稿凭证（如有）并标记不生成凭证 */
  async reject(id: string, dto: RejectReceiptDto): Promise<any> {
    const receipt = await this.findEntity(id)
    if (receipt.status === ReceiptStatus.CONFIRMED) {
      throw new BadRequestException('该票据已确认入账，不能驳回')
    }
    if (receipt.status === ReceiptStatus.REJECTED) {
      throw new BadRequestException('该票据已驳回')
    }
    if (receipt.status !== ReceiptStatus.PARSED && receipt.status !== ReceiptStatus.DRAFTED) {
      throw new BadRequestException('当前状态不支持驳回')
    }

    if (receipt.voucherId) {
      const linked = await this.voucherRepo.findOne({ where: { id: receipt.voucherId } })
      if (linked) {
        if (linked.status === VoucherStatus.DRAFT) {
          await this.vouchers.remove(linked.id)
        } else {
          throw new BadRequestException('关联凭证已审核，请先反审核或通过红冲处理')
        }
      }
    }

    receipt.status = ReceiptStatus.REJECTED
    receipt.rejectReason = dto.reason ?? null
    receipt.rejectedAt = new Date()
    receipt.voucherId = null
    await this.receiptRepo.save(receipt)
    return this.detail(id)
  }

  // ==================== 内部 ====================

  /** 按模板生成分录：科目编码→ID、对手方找/建往来单位、金额解析并强制借贷平衡 */
  private async buildEntries(
    receipt: Receipt,
    suggestion: ClassifySuggestion,
  ): Promise<Array<{ summary: string; accountId: string; partnerId?: string; debit?: number; credit?: number }>> {
    const fields = this.parseFields(receipt)
    const total = this.num(fields.total_amount)
      ?? ((this.num(fields.amount) ?? 0) + (this.num(fields.tax_amount) ?? 0))
    const tax = this.num(fields.tax_amount) ?? 0
    const net = total - tax

    const rows: Array<{
      summary: string
      accountId: string
      partnerId: string | null
      amount: number
      direction: 'debit' | 'credit'
    }> = []
    for (const tpl of suggestion.entries) {
      const account = await this.requireLeafAccount(tpl.accountCode)
      let amount: number
      if (tpl.amountSource === 'tax_amount') amount = tax
      else if (tpl.amountSource === 'amount') amount = net
      else amount = total
      const partnerId = await this.resolvePartner(suggestion, tpl)
      rows.push({
        summary: (tpl.summary ?? '').slice(0, 200),
        accountId: account.id,
        partnerId,
        amount: fromCents(toCents(amount)),
        direction: tpl.direction,
      })
    }

    // 差额修正到第一条主分录（费用/收入），保证草稿通过平衡校验
    let debit = 0
    let credit = 0
    for (const r of rows) {
      if (r.direction === 'debit') debit += toCents(r.amount)
      else credit += toCents(r.amount)
    }
    const diff = credit - debit
    if (diff !== 0 && rows.length) {
      const target =
        rows.find((r) => r.direction === 'debit') ??
        rows.find((r) => r.direction === 'credit') ??
        rows[0]
      const next = toCents(target.amount) + (target.direction === 'debit' ? diff : -diff)
      target.amount = fromCents(Math.max(0, next))
    }

    return rows.map((r) => ({
      summary: r.summary,
      accountId: r.accountId,
      partnerId: r.partnerId ?? undefined,
      debit: r.direction === 'debit' ? r.amount : undefined,
      credit: r.direction === 'credit' ? r.amount : undefined,
    }))
  }

  /** 解析分录上的往来单位：按名称命中则复用，否则自动建档（编码后端生成） */
  private async resolvePartner(
    suggestion: ClassifySuggestion,
    tpl: DraftEntryTemplate,
  ): Promise<string | null> {
    if (!tpl.partnerField) return null
    const name = (suggestion.counterparty ?? '').trim()
    if (!name) return null
    const key = name.slice(0, 100)

    const existed = await this.partnerRepo.findOne({ where: { name: key } })
    if (existed) return existed.id

    const code = await nextCode(this.partnerRepo, CODE_PREFIX.partner)
    const saved = await this.partnerRepo.save(
      this.partnerRepo.create({
        code,
        name: key,
        type: tpl.partnerField === 'buyer_name' ? PartnerType.CUSTOMER : PartnerType.SUPPLIER,
        status: 1,
      }),
    )
    return saved.id
  }

  private async requireLeafAccount(code: string): Promise<Account> {
    const account = await this.accountRepo.findOne({ where: { code } })
    if (!account) throw new BadRequestException(`草稿科目「${code}」不存在，请在会计科目中维护或调整归类规则`)
    if (!account.isLeaf) {
      throw new BadRequestException(`草稿科目「${account.fullName}」不是明细科目，不能记账`)
    }
    if (account.status !== 1) {
      throw new BadRequestException(`草稿科目「${account.fullName}」已禁用`)
    }
    return account
  }

  private assertDraftable(receipt: Receipt): void {
    if (receipt.status === ReceiptStatus.CONFIRMED) {
      throw new BadRequestException('该票据已确认入账，不能重新生成草稿')
    }
    if (receipt.status === ReceiptStatus.REJECTED) {
      throw new BadRequestException('该票据已驳回，如需重新处理请重新上传')
    }
    if (receipt.status !== ReceiptStatus.PARSED && receipt.status !== ReceiptStatus.DRAFTED) {
      throw new BadRequestException('当前状态不支持生成凭证草稿')
    }
  }

  /**
   * P17.6 修正回写：确认入账时若主分录科目与默认建议不同，
   * 按交易对手（partner 规则）记入/更新规则，下次自动命中。
   */
  private async learnFromCorrection(receipt: Receipt): Promise<void> {
    try {
      const suggestion = await this.classify.suggest(receipt, { countHit: false })
      if (!suggestion.entries.length || !suggestion.account) return
      const counterparty = (suggestion.counterparty ?? '').trim()
      if (!counterparty) return

      const linked = await this.voucherRepo.findOne({ where: { id: receipt.voucherId } })
      if (!linked) return
      const entries = await this.entryRepo.find({ where: { voucherId: linked.id }, order: { sort: 'ASC' } })
      const main = entries[0]
      if (!main || main.accountCode === suggestion.account.code) return // 未修正，无需回写

      const key = counterparty.slice(0, 100)
      const existed = await this.ruleRepo.findOne({ where: { matchType: 'partner', matchValue: key } })
      if (existed) {
        if (existed.targetAccountCode !== main.accountCode) {
          existed.targetAccountCode = main.accountCode
          existed.learned = true
          await this.ruleRepo.save(existed)
        }
        return
      }
      await this.ruleRepo.save(
        this.ruleRepo.create({
          ruleName: `${key} 归类（自动学习）`,
          matchType: 'partner',
          matchValue: key,
          kind: suggestion.kind === 'output_vat' ? 'income' : 'expense',
          targetAccountCode: main.accountCode,
          priority: 50,
          enabled: 1,
          hitCount: 0,
          learned: true,
        }),
      )
    } catch (err) {
      this.logger.warn(`修正回写失败: ${(err as Error).message}`)
    }
  }

  /** 展示视图：基础信息 + 识别字段 + 归类建议 + 凭证草稿 */
  private async enrich(receipt: Receipt): Promise<any> {
    let suggestion: ClassifySuggestion | null = null
    try {
      suggestion = await this.classify.suggest(receipt, { countHit: false })
    } catch {
      suggestion = null
    }

    let draft: any = null
    if (receipt.voucherId) {
      try {
        const voucher = await this.vouchers.findOne(receipt.voucherId)
        if (voucher) {
          draft = {
            id: voucher.id,
            voucherNo: voucher.voucherNo,
            word: voucher.word,
            voucherDate: voucher.voucherDate,
            status: voucher.status,
            entries: (voucher.entries ?? []).map((e: any) => ({
              id: e.id,
              summary: e.summary,
              accountId: e.accountId,
              accountCode: e.accountCode,
              accountName: e.accountName,
              partnerId: e.partnerId,
              debit: e.debit,
              credit: e.credit,
              sort: e.sort,
            })),
          }
        }
      } catch {
        draft = null
      }
    }

    return {
      id: receipt.id,
      fileName: receipt.fileName,
      mimeType: receipt.mimeType,
      receiptType: receipt.receiptType,
      receiptTypeName: receipt.receiptTypeName,
      storagePath: receipt.storagePath,
      confidence: receipt.confidence,
      status: receipt.status,
      issueDate: receipt.issueDate,
      amount: receipt.amount,
      taxAmount: receipt.taxAmount,
      invoiceCode: receipt.invoiceCode,
      invoiceNo: receipt.invoiceNo,
      sellerName: receipt.sellerName,
      buyerName: receipt.buyerName,
      rejectReason: receipt.rejectReason,
      confirmedByName: receipt.confirmedByName,
      confirmedAt: receipt.confirmedAt,
      rejectedAt: receipt.rejectedAt,
      voucherId: receipt.voucherId,
      createdAt: receipt.createdAt,
      fields: this.parseFieldsArray(receipt),
      suggestion,
      draft,
    }
  }

  private parseFields(receipt: Receipt): Record<string, string | number | null> {
    const map: Record<string, string | number | null> = {}
    for (const f of this.parseFieldsArray(receipt)) map[f.key] = f.value
    return map
  }

  private parseFieldsArray(receipt: Receipt): Array<{
    key: string
    label: string
    value: string | number | null
    confidence: number
  }> {
    if (!receipt.structured) return []
    try {
      const parsed = JSON.parse(receipt.structured)
      return parsed.fields ?? []
    } catch {
      return []
    }
  }

  private num(v: string | number | null | undefined): number | null {
    if (v === null || v === undefined) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  private async findEntity(id: string): Promise<Receipt> {
    const receipt = await this.receiptRepo.findOne({ where: { id } })
    if (!receipt) throw new NotFoundException('票据不存在')
    return receipt
  }
}
