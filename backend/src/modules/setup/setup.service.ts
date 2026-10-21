import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Company } from '../../entities/company.entity'
import { UserCompany } from '../../entities/user-company.entity'
import { Account } from '../../entities/account.entity'
import { ACCOUNT_SEED, CATEGORY_LABELS, inferCategory } from '../../db/seeds/account.seed'
import {
  DEFAULT_AUTO_POST_THRESHOLD,
  DEFAULT_SMALL_SCALE_VAT_RATE,
} from '../../common/company/company.constants'
import { invalidateCompanyCache } from '../../common/company/company-scope.interceptor'
import type { BootstrapCompanyDto } from './dto/bootstrap-company.dto'

/**
 * 内核建账入口：创建系统中的第一家记账公司。
 *
 * 设计边界（与《插件开发与迁移指南》1.2 一致）：
 * - 内核必须能在「零插件」状态下完成登录 → 建账套 → 记账；
 * - 因此保留本服务，负责建公司 + 初始化标准科目 + 绑定创建者；
 * - 公司档案的日常管理（列表、编辑、删除、成员授权、新建更多公司）
 *   全部由 multi-company 插件接管，停用/卸载插件不影响已建账套记账。
 */
@Injectable()
export class SetupService {
  private readonly logger = new Logger(SetupService.name)

  constructor(
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    @InjectRepository(UserCompany) private readonly linkRepo: Repository<UserCompany>,
    @InjectRepository(Account) private readonly accountRepo: Repository<Account>,
  ) {}

  async bootstrap(dto: BootstrapCompanyDto, operatorId: string): Promise<Record<string, any>> {
    const total = await this.companyRepo.count()
    if (total > 0) {
      throw new BadRequestException('系统中已存在记账公司，请使用「公司管理」创建新账套')
    }

    const code = (dto.code ?? '').trim() || 'GS001'
    if (await this.companyRepo.findOne({ where: { code } })) {
      throw new BadRequestException(`公司编码「${code}」已存在`)
    }

    const company = await this.companyRepo.save(
      this.companyRepo.create({
        code,
        name: dto.name.trim(),
        taxNo: dto.taxNo?.trim().toUpperCase() || null,
        taxpayerType: dto.taxpayerType ?? 'small_scale',
        vatRate: dto.taxpayerType === 'general' ? 0 : (dto.vatRate ?? DEFAULT_SMALL_SCALE_VAT_RATE),
        taxDeclareCycle: dto.taxDeclareCycle ?? 'month',
        autoPostThreshold: DEFAULT_AUTO_POST_THRESHOLD,
        autoPostEnabled: 1,
        legalPerson: dto.legalPerson?.trim() || null,
        industry: dto.industry?.trim() || null,
        address: dto.address?.trim() || null,
        bankName: dto.bankName?.trim() || null,
        bankAccount: dto.bankAccount?.trim() || null,
        fiscalStartMonth: dto.fiscalStartMonth ?? 1,
        status: 1,
        remark: dto.remark?.trim() || null,
      }),
    )

    await this.seedTemplateAccounts(company.id)
    await this.linkRepo.save(
      this.linkRepo.create({
        userId: operatorId,
        companyId: company.id,
        isOwner: true,
        status: 1,
      }),
    )

    invalidateCompanyCache(company.id)
    this.logger.log(`已创建首个记账公司「${company.name}」（${company.code}）`)
    return this.toVo(company)
  }

  /** 从内置标准模板生成科目（与系统首次初始化一致） */
  private async seedTemplateAccounts(companyId: string): Promise<number> {
    let order = 0
    const saveRecursive = async (
      nodes: typeof ACCOUNT_SEED,
      parentId: string | null,
      parentPath: string[],
    ): Promise<number> => {
      let count = 0
      for (const node of nodes) {
        order += 1
        const category = inferCategory(node.code)
        const path = [CATEGORY_LABELS[category] ?? category, ...parentPath, node.name]
        const saved = await this.accountRepo.save(
          this.accountRepo.create({
            companyId,
            code: node.code,
            name: node.name,
            fullName: path.join('.'),
            category,
            level: path.length - 1,
            direction: node.direction,
            parentId,
            isLeaf: !node.children?.length,
            auxiliaryTypes: node.auxiliaryTypes ?? null,
            isCash: node.isCash ?? false,
            isBank: node.isBank ?? false,
            status: 1,
            sort: node.sort ?? order,
            remark: null,
          }),
        )
        count += 1
        if (node.children?.length) {
          count += await saveRecursive(node.children, saved.id, path)
        }
      }
      return count
    }
    return saveRecursive(ACCOUNT_SEED, null, [])
  }

  private toVo(company: Company): Record<string, any> {
    return {
      id: company.id,
      code: company.code,
      name: company.name,
      taxNo: company.taxNo,
      taxpayerType: company.taxpayerType,
      vatRate: company.vatRate,
      taxDeclareCycle: company.taxDeclareCycle,
      autoPostThreshold: company.autoPostThreshold,
      autoPostEnabled: company.autoPostEnabled,
      legalPerson: company.legalPerson,
      industry: company.industry,
      address: company.address,
      bankName: company.bankName,
      bankAccount: company.bankAccount,
      fiscalStartMonth: company.fiscalStartMonth,
      status: company.status,
      remark: company.remark,
      createdAt: company.createdAt,
      isOwner: true,
    }
  }
}
