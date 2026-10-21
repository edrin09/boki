"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArApService = void 0;
const common_1 = require("@nestjs/common");
const business_entity_1 = require("@core/entities/business.entity");
const account_entity_1 = require("@core/entities/account.entity");
const bank_account_entity_1 = require("@core/entities/bank-account.entity");
const partner_entity_1 = require("@core/entities/partner.entity");
const voucher_entity_1 = require("@core/entities/voucher.entity");
const enums_1 = require("@core/common/enums");
const money_util_1 = require("@core/common/utils/money.util");
const company_repository_1 = require("@core/common/company/company.repository");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
const books_service_1 = require("@core/modules/books/books.service");
const vouchers_service_1 = require("@core/modules/vouchers/vouchers.service");
const DEFAULT_RECEIVABLE_CODE = '1122';
const DEFAULT_PAYABLE_CODE = '2202';
let ArApService = class ArApService {
    repo;
    accountRepo;
    bankRepo;
    partnerRepo;
    voucherRepo;
    booksService;
    vouchersService;
    constructor(repo, accountRepo, bankRepo, partnerRepo, voucherRepo, booksService, vouchersService) {
        this.repo = repo;
        this.accountRepo = accountRepo;
        this.bankRepo = bankRepo;
        this.partnerRepo = partnerRepo;
        this.voucherRepo = voucherRepo;
        this.booksService = booksService;
        this.vouchersService = vouchersService;
    }
    // ==================== 往来余额查询 ====================
    /** 应收余额（按往来单位） */
    async receivable(query) {
        return this.listByPartner(query, DEFAULT_RECEIVABLE_CODE, '应收');
    }
    /** 应付余额（按往来单位） */
    async payable(query) {
        return this.listByPartner(query, DEFAULT_PAYABLE_CODE, '应付');
    }
    async listByPartner(query, defaultCode, label) {
        const code = query.accountCode || defaultCode;
        const account = await this.accountRepo.findOne({ where: { code } });
        if (!account) {
            throw new common_1.NotFoundException(`科目「${code}」不存在，请在参数中指定 ${label} 科目编码`);
        }
        const result = await this.booksService.subLedger({
            accountId: account.id,
            endPeriod: query.endPeriod,
            fiscalYear: query.fiscalYear,
            partnerIds: query.partnerIds,
        });
        const onlyWithBalance = ['true', '1', true, 1].includes(query.onlyWithBalance);
        const rows = (result.groups ?? [])
            .map((g) => ({
            partnerId: g.partnerId,
            partnerName: g.partnerName,
            openingBalance: g.openingDebit > 0 ? g.openingDebit : g.openingCredit,
            periodDebit: g.periodDebit,
            periodCredit: g.periodCredit,
            closingBalance: g.closingDebit > 0 ? g.closingDebit : g.closingCredit,
            direction: g.closingDebit > 0 ? 'debit' : 'credit',
            entries: g.entries,
        }))
            .filter((r) => (onlyWithBalance ? r.closingBalance !== 0 : true));
        return {
            label,
            account: {
                id: account.id,
                code: account.code,
                name: account.name,
                fullName: account.fullName,
            },
            period: result.period,
            rows,
            totals: {
                closingDebit: result.totals.closingDebit,
                closingCredit: result.totals.closingCredit,
                balance: result.totals.closingDebit > 0
                    ? result.totals.closingDebit
                    : result.totals.closingCredit,
            },
        };
    }
    // ==================== 核销记录 ====================
    async findWriteOffs(query) {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        const qb = this.repo.createQueryBuilder('w');
        if (query.type)
            qb.andWhere('w.type = :type', { type: query.type });
        if (query.keyword) {
            qb.andWhere('(w.partnerName LIKE :kw OR w.summary LIKE :kw)', { kw: `%${query.keyword}%` });
        }
        const [list, total] = await qb
            .orderBy('w.bizDate', 'DESC')
            .addOrderBy('w.createdAt', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize)
            .getManyAndCount();
        return { list, total, page, pageSize };
    }
    /** 创建核销（生成凭证） */
    async createWriteOff(dto, operator, autoApprove = true) {
        if ((0, money_util_1.toCents)(dto.amount) <= 0) {
            throw new common_1.BadRequestException('核销金额必须大于 0');
        }
        const partner = await this.partnerRepo.findOne({ where: { id: dto.partnerId } });
        if (!partner)
            throw new common_1.BadRequestException('往来单位不存在');
        if (partner.status !== 1)
            throw new common_1.BadRequestException('往来单位已禁用');
        const bank = await this.bankRepo.findOne({ where: { id: dto.bankAccountId } });
        if (!bank)
            throw new common_1.BadRequestException('资金账户不存在');
        if (!bank.accountCode) {
            throw new common_1.BadRequestException(`资金账户「${bank.name}」未关联会计科目`);
        }
        const bankAccount = await this.accountRepo.findOne({ where: { code: bank.accountCode } });
        if (!bankAccount || !bankAccount.isLeaf) {
            throw new common_1.BadRequestException(`资金账户「${bank.name}」关联科目无效`);
        }
        const arAccount = await this.resolveArApAccount(dto);
        const summary = dto.summary ?? (dto.type === 'receivable' ? '应收账款核销' : '应付账款核销');
        const entries = dto.type === 'receivable'
            ? [
                { summary, accountId: bankAccount.id, debit: dto.amount, partnerId: partner.id },
                { summary, accountId: arAccount.id, credit: dto.amount, partnerId: partner.id },
            ]
            : [
                { summary, accountId: arAccount.id, debit: dto.amount, partnerId: partner.id },
                { summary, accountId: bankAccount.id, credit: dto.amount, partnerId: partner.id },
            ];
        const voucher = await this.vouchersService.createFromSystem({
            word: '记',
            voucherDate: dto.bizDate,
            entries,
            remark: dto.remark,
            sourceType: enums_1.VoucherSource.AR_AP,
            sourceId: '',
            autoApprove,
        }, operator);
        const entity = this.repo.create({
            type: dto.type,
            partnerId: partner.id,
            partnerName: partner.name,
            bizDate: dto.bizDate.slice(0, 10),
            bankAccountId: bank.id,
            bankAccountName: bank.name,
            accountId: arAccount.id,
            accountName: arAccount.name,
            amount: dto.amount,
            summary,
            voucherId: voucher.id,
            createdBy: operator.id,
            createdByName: operator.nickname,
            remark: dto.remark ?? null,
        });
        const saved = await this.repo.save(entity);
        await this.voucherRepo.update({ id: voucher.id }, { sourceId: saved.id });
        return this.toVo(saved);
    }
    /** 撤销核销（同时删除对应凭证） */
    async removeWriteOff(id) {
        const entity = await this.repo.findOne({ where: { id } });
        if (!entity)
            throw new common_1.NotFoundException('核销记录不存在');
        if (entity.voucherId) {
            const voucher = await this.voucherRepo.findOne({ where: { id: entity.voucherId } });
            if (voucher) {
                if (voucher.status === enums_1.VoucherStatus.APPROVED) {
                    await this.vouchersService.unapprove(voucher.id);
                }
                await this.vouchersService.remove(voucher.id);
            }
        }
        await this.repo.delete({ id });
        return { message: '核销记录已撤销' };
    }
    async resolveArApAccount(dto) {
        let account = null;
        if (dto.accountId) {
            account = await this.accountRepo.findOne({ where: { id: dto.accountId } });
            if (!account)
                throw new common_1.BadRequestException('应收/应付科目不存在');
        }
        else {
            const code = dto.type === 'receivable' ? DEFAULT_RECEIVABLE_CODE : DEFAULT_PAYABLE_CODE;
            account = await this.accountRepo.findOne({ where: { code } });
            if (!account) {
                throw new common_1.BadRequestException(`未找到默认科目「${code}」，请在参数中指定应收/应付科目`);
            }
        }
        if (!account.isLeaf) {
            throw new common_1.BadRequestException(`科目「${account.fullName}」不是明细科目`);
        }
        if (account.status !== 1) {
            throw new common_1.BadRequestException(`科目「${account.fullName}」已禁用`);
        }
        return account;
    }
    toVo(entity) {
        return {
            id: entity.id,
            type: entity.type,
            partnerId: entity.partnerId,
            partnerName: entity.partnerName,
            bizDate: entity.bizDate,
            bankAccountId: entity.bankAccountId,
            bankAccountName: entity.bankAccountName,
            accountId: entity.accountId,
            accountName: entity.accountName,
            amount: entity.amount,
            summary: entity.summary,
            voucherId: entity.voucherId,
            createdByName: entity.createdByName,
            remark: entity.remark,
            createdAt: entity.createdAt,
        };
    }
};
exports.ArApService = ArApService;
exports.ArApService = ArApService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, company_repo_decorator_1.InjectCompanyRepo)(business_entity_1.WriteOff)),
    __param(1, (0, company_repo_decorator_1.InjectCompanyRepo)(account_entity_1.Account)),
    __param(2, (0, company_repo_decorator_1.InjectCompanyRepo)(bank_account_entity_1.BankAccount)),
    __param(3, (0, company_repo_decorator_1.InjectCompanyRepo)(partner_entity_1.Partner)),
    __param(4, (0, company_repo_decorator_1.InjectCompanyRepo)(voucher_entity_1.Voucher)),
    __metadata("design:paramtypes", [company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        books_service_1.BooksService,
        vouchers_service_1.VouchersService])
], ArApService);
