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
exports.IncomeExpenseService = void 0;
const common_1 = require("@nestjs/common");
const business_entity_1 = require("@core/entities/business.entity");
const account_entity_1 = require("@core/entities/account.entity");
const bank_account_entity_1 = require("@core/entities/bank-account.entity");
const voucher_entity_1 = require("@core/entities/voucher.entity");
const enums_1 = require("@core/common/enums");
const money_util_1 = require("@core/common/utils/money.util");
const company_repository_1 = require("@core/common/company/company.repository");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
const vouchers_service_1 = require("@core/modules/vouchers/vouchers.service");
/** 未指定收付款账户时使用的默认科目编码 */
const DEFAULT_CASH_CODE = '1001';
const DEFAULT_BANK_CODE = '1002';
let IncomeExpenseService = class IncomeExpenseService {
    repo;
    accountRepo;
    bankRepo;
    voucherRepo;
    vouchersService;
    constructor(repo, accountRepo, bankRepo, voucherRepo, vouchersService) {
        this.repo = repo;
        this.accountRepo = accountRepo;
        this.bankRepo = bankRepo;
        this.voucherRepo = voucherRepo;
        this.vouchersService = vouchersService;
    }
    async findAll(query) {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        const qb = this.repo.createQueryBuilder('i');
        if (query.bizType)
            qb.andWhere('i.bizType = :bizType', { bizType: query.bizType });
        if (query.startDate)
            qb.andWhere('i.bizDate >= :startDate', { startDate: query.startDate });
        if (query.endDate)
            qb.andWhere('i.bizDate <= :endDate', { endDate: query.endDate });
        if (query.keyword) {
            qb.andWhere('(i.summary LIKE :kw OR i.accountName LIKE :kw)', { kw: `%${query.keyword}%` });
        }
        const [list, total] = await qb
            .orderBy('i.bizDate', 'DESC')
            .addOrderBy('i.createdAt', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize)
            .getManyAndCount();
        return { list, total, page, pageSize };
    }
    async findOne(id) {
        const entity = await this.repo.findOne({ where: { id } });
        if (!entity)
            throw new common_1.NotFoundException('单据不存在');
        return this.toVo(entity);
    }
    async create(dto, operator, autoApprove = true) {
        const { account, bankAccount, bank, entries, defaultSummary } = await this.resolveContext(dto);
        const voucher = await this.vouchersService.createFromSystem({
            word: '记',
            voucherDate: dto.bizDate,
            entries,
            remark: dto.remark ?? dto.summary,
            sourceType: enums_1.VoucherSource.INCOME_EXPENSE,
            sourceId: '',
            autoApprove,
        }, operator);
        const entity = this.repo.create({
            bizType: dto.bizType,
            bizDate: dto.bizDate.slice(0, 10),
            bankAccountId: bank?.id ?? null,
            bankAccountName: bank?.name ?? null,
            accountId: account.id,
            accountName: account.name,
            partnerId: dto.partnerId || null,
            departmentId: dto.departmentId || null,
            projectId: dto.projectId || null,
            amount: dto.amount,
            summary: dto.summary ?? defaultSummary,
            voucherId: voucher.id,
            createdBy: operator.id,
            createdByName: operator.nickname,
            remark: dto.remark ?? null,
        });
        const saved = await this.repo.save(entity);
        await this.voucherRepo.update({ id: voucher.id }, { sourceId: saved.id });
        void bankAccount;
        return this.toVo(saved);
    }
    async update(id, dto, operator, autoApprove = true) {
        const entity = await this.repo.findOne({ where: { id } });
        if (!entity)
            throw new common_1.NotFoundException('单据不存在');
        if (entity.voucherId) {
            const old = await this.voucherRepo.findOne({ where: { id: entity.voucherId } });
            if (old && old.status === enums_1.VoucherStatus.APPROVED) {
                throw new common_1.BadRequestException('已生成已审核凭证，请先反审核后再修改单据');
            }
            if (old)
                await this.vouchersService.remove(old.id);
        }
        const { account, bank, entries, defaultSummary } = await this.resolveContext(dto);
        const voucher = await this.vouchersService.createFromSystem({
            word: '记',
            voucherDate: dto.bizDate,
            entries,
            remark: dto.remark ?? dto.summary,
            sourceType: enums_1.VoucherSource.INCOME_EXPENSE,
            sourceId: id,
            autoApprove,
        }, operator);
        entity.bizType = dto.bizType;
        entity.bizDate = dto.bizDate.slice(0, 10);
        entity.bankAccountId = bank?.id ?? null;
        entity.bankAccountName = bank?.name ?? null;
        entity.accountId = account.id;
        entity.accountName = account.name;
        entity.partnerId = dto.partnerId || null;
        entity.departmentId = dto.departmentId || null;
        entity.projectId = dto.projectId || null;
        entity.amount = dto.amount;
        entity.summary = dto.summary ?? defaultSummary;
        entity.voucherId = voucher.id;
        entity.remark = dto.remark ?? null;
        const saved = await this.repo.save(entity);
        return this.toVo(saved);
    }
    async remove(id) {
        const entity = await this.repo.findOne({ where: { id } });
        if (!entity)
            throw new common_1.NotFoundException('单据不存在');
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
        return { message: '删除成功' };
    }
    // ==================== 内部 ====================
    async resolveContext(dto) {
        if ((0, money_util_1.toCents)(dto.amount) <= 0) {
            throw new common_1.BadRequestException('金额必须大于 0');
        }
        const account = await this.accountRepo.findOne({ where: { id: dto.accountId } });
        if (!account)
            throw new common_1.BadRequestException('会计科目不存在');
        if (!account.isLeaf)
            throw new common_1.BadRequestException(`科目「${account.fullName}」不是明细科目`);
        if (account.status !== 1)
            throw new common_1.BadRequestException(`科目「${account.fullName}」已禁用`);
        // 收付方科目
        let bank = null;
        let bankAccount;
        if (dto.bankAccountId) {
            bank = await this.bankRepo.findOne({ where: { id: dto.bankAccountId } });
            if (!bank)
                throw new common_1.BadRequestException('资金账户不存在');
            if (!bank.accountCode) {
                throw new common_1.BadRequestException(`资金账户「${bank.name}」未关联会计科目`);
            }
            bankAccount = await this.accountRepo.findOne({ where: { code: bank.accountCode } });
            if (!bankAccount || !bankAccount.isLeaf) {
                throw new common_1.BadRequestException(`资金账户「${bank.name}」关联科目无效`);
            }
        }
        else {
            const code = dto.bizType === 'income' ? DEFAULT_BANK_CODE : DEFAULT_CASH_CODE;
            bankAccount = await this.accountRepo.findOne({ where: { code } });
            if (!bankAccount) {
                throw new common_1.BadRequestException(`未找到默认资金科目「${code}」，请指定收付款账户`);
            }
        }
        if (bankAccount.id === account.id) {
            throw new common_1.BadRequestException('收付款科目不能与收入/费用科目相同');
        }
        const summary = dto.summary ?? (dto.bizType === 'income' ? '其他收入' : '其他支出');
        const aux = {
            partnerId: dto.partnerId,
            departmentId: dto.departmentId,
            projectId: dto.projectId,
        };
        const entries = dto.bizType === 'income'
            ? [
                { summary, accountId: bankAccount.id, debit: dto.amount, ...aux },
                { summary, accountId: account.id, credit: dto.amount, ...aux },
            ]
            : [
                { summary, accountId: account.id, debit: dto.amount, ...aux },
                { summary, accountId: bankAccount.id, credit: dto.amount, ...aux },
            ];
        const defaultSummary = `${summary} - ${bankAccount.name}`;
        return { account, bankAccount, bank, entries, defaultSummary };
    }
    toVo(entity) {
        return {
            id: entity.id,
            bizType: entity.bizType,
            bizDate: entity.bizDate,
            bankAccountId: entity.bankAccountId,
            bankAccountName: entity.bankAccountName,
            accountId: entity.accountId,
            accountName: entity.accountName,
            partnerId: entity.partnerId,
            departmentId: entity.departmentId,
            projectId: entity.projectId,
            amount: entity.amount,
            summary: entity.summary,
            voucherId: entity.voucherId,
            createdByName: entity.createdByName,
            remark: entity.remark,
            createdAt: entity.createdAt,
            updatedAt: entity.updatedAt,
        };
    }
};
exports.IncomeExpenseService = IncomeExpenseService;
exports.IncomeExpenseService = IncomeExpenseService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, company_repo_decorator_1.InjectCompanyRepo)(business_entity_1.IncomeExpense)),
    __param(1, (0, company_repo_decorator_1.InjectCompanyRepo)(account_entity_1.Account)),
    __param(2, (0, company_repo_decorator_1.InjectCompanyRepo)(bank_account_entity_1.BankAccount)),
    __param(3, (0, company_repo_decorator_1.InjectCompanyRepo)(voucher_entity_1.Voucher)),
    __metadata("design:paramtypes", [company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        vouchers_service_1.VouchersService])
], IncomeExpenseService);
