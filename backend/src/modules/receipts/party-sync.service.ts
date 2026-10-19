import { Injectable } from '@nestjs/common'
import { Partner } from '../../entities/partner.entity'
import { PartnerType } from '../../common/enums'
import { CODE_PREFIX, nextCode } from '../../common/utils/code.util'
import { CompanyScopedRepository } from '../../common/company/company.repository'
import { InjectCompanyRepo } from '../../common/company/company-repo.decorator'
import { SystemService } from '../system/system.service'
import { normName } from './parsers/parser.utils'

/** 发票一侧的识别字段（字段名与往来单位一致） */
export interface PartyFields {
  name?: string | number | null
  taxNo?: string | number | null
  address?: string | number | null
  phone?: string | number | null
  bank?: string | number | null
  bankAccount?: string | number | null
}

function str(v: string | number | null | undefined): string {
  return v === null || v === undefined ? '' : String(v).trim()
}
function cut(s: string, max: number): string | null {
  return s ? s.slice(0, max) : null
}

/**
 * 往来单位建档/回填（购买方/销售方共用）：
 * 按纳税人识别号优先去重、其次按名称；命中已有档案只回填空字段，不覆盖手工填写。
 */
@Injectable()
export class PartySyncService {
  constructor(
    @InjectCompanyRepo(Partner) private readonly partnerRepo: CompanyScopedRepository<Partner>,
    private readonly systemService: SystemService,
  ) {}

  /** 单边同步：识别出名称即入库；返回往来单位 id（未识别名称返回 null） */
  async syncParty(f: PartyFields, side: 'buyer' | 'seller'): Promise<string | null> {
    const name = str(f.name)
    if (!name) return null
    const taxNo = str(f.taxNo)
    const addr = str(f.address)
    const phone = str(f.phone)
    const bank = str(f.bank)
    const bankAcct = str(f.bankAccount)

    // 本公司（当前记账公司）是票据的购/销一方时不能建档为客户/供应商：
    // 它是账套主体本身，不是交易对手（销项票的销售方、进项票的购买方都是自己）
    if (await this.isSelfCompany(taxNo, name)) return null

    let partner: Partner | null = taxNo ? await this.partnerRepo.findOne({ where: { taxNo } }) : null
    if (!partner) partner = await this.partnerRepo.findOne({ where: { name: name.slice(0, 100) } })

    // 命中已有档案：只回填空字段，不覆盖手工填写
    if (partner) {
      const patch: Partial<Partner> = {}
      if (taxNo && !partner.taxNo) patch.taxNo = taxNo
      if (addr && !partner.address) patch.address = cut(addr, 200)
      if (phone && !partner.phone) patch.phone = cut(phone, 30)
      if (bank && !partner.bankName) patch.bankName = cut(bank, 100)
      if (bankAcct && !partner.bankAccount) patch.bankAccount = cut(bankAcct, 50)
      if (Object.keys(patch).length > 0) {
        Object.assign(partner, patch)
        await this.partnerRepo.save(partner)
      }
      return partner.id
    }

    // 自动建档：识别字段按字段名全部入库
    const code = await nextCode(this.partnerRepo, CODE_PREFIX.partner)
    const saved = await this.partnerRepo.save(
      this.partnerRepo.create({
        code,
        name: name.slice(0, 100),
        taxNo: taxNo || null,
        address: cut(addr, 200),
        phone: cut(phone, 30),
        bankName: cut(bank, 100),
        bankAccount: cut(bankAcct, 50),
        type: side === 'buyer' ? PartnerType.CUSTOMER : PartnerType.SUPPLIER,
        status: 1,
      }),
    )
    return saved.id
  }

  /** 购销双方同步入库（按纳税人识别号去重）；识别到哪方就建哪方。串行执行避免同税号同时建档重复 */
  async syncBoth(
    fields: Record<string, string | number | null>,
  ): Promise<{ buyerId: string | null; sellerId: string | null }> {
    const buyerId = await this.syncParty(
      {
        name: fields['buyer_name'],
        taxNo: fields['buyer_tax_no'],
        address: fields['buyer_address'],
        phone: fields['buyer_phone'],
        bank: fields['buyer_bank'],
        bankAccount: fields['buyer_bank_account'],
      },
      'buyer',
    )
    const sellerId = await this.syncParty(
      {
        name: fields['seller_name'],
        taxNo: fields['seller_tax_no'],
        address: fields['seller_address'],
        phone: fields['seller_phone'],
        bank: fields['seller_bank'],
        bankAccount: fields['seller_bank_account'],
      },
      'seller',
    )
    return { buyerId, sellerId }
  }

  /**
   * 判断票据一侧是否是本公司（当前记账公司）自身。
   * 优先按纳税人识别号比对；识别号缺失时按归一化名称互相包含比对
   * （与 ClassifyService 的方向判定口径一致，兼容 OCR 产生的空格差异）。
   */
  private async isSelfCompany(taxNo: string, name: string): Promise<boolean> {
    const company = await this.systemService.getCompanyInfo().catch(() => null)
    if (!company) return false // 无公司上下文时无法判定，保持原有建档行为
    if (taxNo && company.taxNo && taxNo.toUpperCase() === company.taxNo.toUpperCase()) {
      return true
    }
    const partyName = normName(name)
    const companyName = normName(company.companyName ?? '')
    if (!partyName || !companyName) return false
    return partyName.includes(companyName) || companyName.includes(partyName)
  }
}
