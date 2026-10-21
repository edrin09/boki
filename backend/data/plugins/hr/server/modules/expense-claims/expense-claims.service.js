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
exports.ExpenseClaimsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const hr_entity_1 = require("@core/entities/hr.entity");
const hr_entity_2 = require("@core/entities/hr.entity");
const department_entity_1 = require("@core/entities/department.entity");
const account_entity_1 = require("@core/entities/account.entity");
const bank_account_entity_1 = require("@core/entities/bank-account.entity");
const voucher_entity_1 = require("@core/entities/voucher.entity");
const enums_1 = require("@core/common/enums");
const money_util_1 = require("@core/common/utils/money.util");
const company_repository_1 = require("@core/common/company/company.repository");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
const vouchers_service_1 = require("@core/modules/vouchers/vouchers.service");
const employee_settlement_service_1 = require("../loans/employee-settlement.service");
/** 默认费用科目编码 */
const DEFAULT_EXPENSE_CODE = '6602'; // 管理费用
/** 员工垫付挂账科目 */
const DEFAULT_ADVANCE_CODE = '1221'; // 其他应收款
/** 其他应收款下挂员工辅助核算 */
const DEFAULT_CASH_CODE = '1001';
const DEFAULT_BANK_CODE = '1002';
let ExpenseClaimsService = class ExpenseClaimsService {
    repo;
    itemRepo;
    employeeRepo;
    deptRepo;
    accountRepo;
    bankRepo;
    voucherRepo;
    vouchersService;
    settlementService;
    constructor(repo, itemRepo, employeeRepo, deptRepo, accountRepo, bankRepo, voucherRepo, vouchersService, settlementService) {
        this.repo = repo;
        this.itemRepo = itemRepo;
        this.employeeRepo = employeeRepo;
        this.deptRepo = deptRepo;
        this.accountRepo = accountRepo;
        this.bankRepo = bankRepo;
        this.voucherRepo = voucherRepo;
        this.vouchersService = vouchersService;
        this.settlementService = settlementService;
    }
    // ==================== 查询 ====================
    async findAll(query) {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        const qb = this.repo.createQueryBuilder('c');
        if (query.status)
            qb.andWhere('c.status = :status', { status: query.status });
        if (query.employeeId)
            qb.andWhere('c.employeeId = :employeeId', { employeeId: query.employeeId });
        if (query.startDate)
            qb.andWhere('c.claimDate >= :startDate', { startDate: query.startDate });
        if (query.endDate)
            qb.andWhere('c.claimDate <= :endDate', { endDate: query.endDate });
        if (query.keyword) {
            qb.andWhere(new typeorm_1.Brackets((w) => {
                w.where('c.claimNo LIKE :kw', { kw: `%${query.keyword}%` })
                    .orWhere('c.employeeName LIKE :kw', { kw: `%${query.keyword}%` })
                    .orWhere('c.remark LIKE :kw', { kw: `%${query.keyword}%` });
            }));
        }
        const [list, total] = await qb
            .orderBy('c.claimDate', 'DESC')
            .addOrderBy('c.createdAt', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize)
            .getManyAndCount();
        return { list: list.map((c) => this.toVo(c, [])), total, page, pageSize };
    }
    async findOne(id) {
        const claim = await this.repo.findOne({ where: { id } });
        if (!claim)
            throw new common_1.NotFoundException('报销单不存在');
        const items = await this.itemRepo.find({ where: { claimId: id }, order: { sort: 'ASC' } });
        return this.toVo(claim, items);
    }
    /**
     * 批量导出 PDF（原始凭证存根）用：按 ids 或筛选条件取单据+明细，最多 300 张
     */
    async findForPdfExport(dto) {
        const MAX = 300;
        let claims;
        if (dto.ids?.length) {
            claims = await this.repo.find({ where: { id: (0, typeorm_1.In)(dto.ids.slice(0, MAX)) } });
        }
        else {
            const qb = this.repo.createQueryBuilder('c');
            if (dto.status)
                qb.andWhere('c.status = :status', { status: dto.status });
            if (dto.employeeId)
                qb.andWhere('c.employeeId = :employeeId', { employeeId: dto.employeeId });
            if (dto.startDate)
                qb.andWhere('c.claimDate >= :startDate', { startDate: dto.startDate });
            if (dto.endDate)
                qb.andWhere('c.claimDate <= :endDate', { endDate: dto.endDate });
            claims = await qb
                .orderBy('c.claimDate', 'ASC')
                .addOrderBy('c.claimNo', 'ASC')
                .take(MAX)
                .getMany();
        }
        if (!claims.length)
            return [];
        const items = await this.itemRepo.find({ where: { claimId: (0, typeorm_1.In)(claims.map((c) => c.id)) } });
        const byClaim = new Map();
        for (const it of items) {
            const arr = byClaim.get(it.claimId) ?? [];
            arr.push(it);
            byClaim.set(it.claimId, arr);
        }
        for (const arr of byClaim.values())
            arr.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
        claims.sort((a, b) => a.claimDate < b.claimDate ? -1 : a.claimDate > b.claimDate ? 1 : a.claimNo < b.claimNo ? -1 : 1);
        return claims.map((claim) => ({ claim, items: byClaim.get(claim.id) ?? [] }));
    }
    /** 下一个报销单号 */
    async getNextClaimNo(date) {
        const year = date.slice(0, 4).replace(/^0+/, '') || date.slice(0, 4);
        const prefix = `BX${year}`;
        const max = await this.repo
            .createQueryBuilder('c')
            .select('MAX(c.claimNo)', 'max')
            .where('c.claimNo LIKE :prefix', { prefix: `${prefix}%` })
            .getRawOne();
        const last = max?.max ?? `${prefix}000`;
        const seq = parseInt(last.slice(prefix.length), 10) + 1 || 1;
        return `${prefix}${String(seq).padStart(4, '0')}`;
    }
    // ==================== 写入 ====================
    async create(dto, operator) {
        const context = await this.resolveContext(dto);
        // 单号：优先使用外部单号（导入/手工指定），为空或已占用时自动生成
        let claimNo = (dto.claimNo ?? '').trim();
        if (claimNo) {
            const exists = await this.repo.findOne({ where: { claimNo } });
            if (exists)
                claimNo = '';
        }
        if (!claimNo)
            claimNo = await this.getNextClaimNo(dto.claimDate);
        const entity = this.repo.create({
            claimNo,
            claimDate: dto.claimDate.slice(0, 10),
            employeeId: context.employee.id,
            employeeName: context.employee.name,
            departmentId: context.employee.departmentId,
            departmentName: context.departmentName,
            totalAmount: context.totalAmount,
            payMethod: dto.payMethod,
            claimType: dto.claimType ?? (dto.loanId ? enums_1.ExpenseClaimType.LOAN_OFFSET : enums_1.ExpenseClaimType.PAYMENT),
            status: enums_1.ExpenseClaimStatus.DRAFT,
            expenseAccountId: context.defaultExpenseAccount?.id ?? null,
            expenseAccountName: context.defaultExpenseAccount?.name ?? null,
            bankAccountId: context.bankAccount?.id ?? null,
            bankAccountName: context.bankAccount?.name ?? null,
            loanId: dto.loanId ?? null,
            loanNo: null,
            voucherId: null,
            payVoucherId: null,
            createdBy: operator.id,
            createdByName: operator.nickname,
            remark: dto.remark ?? null,
        });
        const saved = await this.repo.save(entity);
        await this.saveItems(saved.id, dto.items, context.defaultExpenseAccount);
        return this.findOne(saved.id);
    }
    async update(id, dto, operator) {
        const claim = await this.findEntity(id);
        void operator;
        this.assertDraft(claim, '编辑');
        const context = await this.resolveContext(dto);
        claim.claimDate = dto.claimDate.slice(0, 10);
        claim.employeeId = context.employee.id;
        claim.employeeName = context.employee.name;
        claim.departmentId = context.employee.departmentId;
        claim.departmentName = context.departmentName;
        claim.totalAmount = context.totalAmount;
        claim.payMethod = dto.payMethod;
        claim.claimType = dto.claimType ?? (dto.loanId ? enums_1.ExpenseClaimType.LOAN_OFFSET : enums_1.ExpenseClaimType.PAYMENT);
        claim.expenseAccountId = context.defaultExpenseAccount?.id ?? null;
        claim.expenseAccountName = context.defaultExpenseAccount?.name ?? null;
        claim.bankAccountId = context.bankAccount?.id ?? null;
        claim.bankAccountName = context.bankAccount?.name ?? null;
        claim.loanId = dto.loanId ?? null;
        claim.remark = dto.remark ?? claim.remark;
        await this.repo.save(claim);
        await this.itemRepo.delete({ claimId: id });
        await this.saveItems(id, dto.items, context.defaultExpenseAccount);
        return this.findOne(id);
    }
    /** 审核：生成费用报销凭证 */
    async approve(id, operator) {
        const claim = await this.findEntity(id);
        this.assertDraft(claim, '审核');
        const items = await this.itemRepo.find({ where: { claimId: id }, order: { sort: 'ASC' } });
        if (!items.length)
            throw new common_1.BadRequestException('报销单没有费用明细');
        const summary = `${claim.employeeName}报销`;
        const entries = items.map((item) => {
            if (!item.accountId) {
                throw new common_1.BadRequestException(`费用行「${item.summary || '未命名'}」未指定费用科目`);
            }
            return {
                summary: item.summary || summary,
                accountId: item.accountId,
                departmentId: claim.departmentId ?? undefined,
                debit: Number(item.amount),
            };
        });
        // 贷方：按支付方式
        entries.push(await this.buildCreditEntry(claim, summary));
        const voucher = await this.vouchersService.createFromSystem({
            word: enums_1.VoucherWord.GENERAl,
            voucherDate: claim.claimDate,
            entries,
            remark: `报销单 ${claim.claimNo}`,
            sourceType: enums_1.VoucherSource.EXPENSE_CLAIM,
            sourceId: id,
            autoApprove: true,
        }, operator);
        claim.status = enums_1.ExpenseClaimStatus.APPROVED;
        claim.voucherId = voucher.id;
        claim.approvedAt = new Date();
        await this.repo.save(claim);
        // 冲抵借款：审核已生成的凭证登记为员工往来核销，并回写借款单已清偿金额。
        // 指定借款单时核销该笔；冲抵型未指定时按借款日期先后 FIFO 自动分配（先借先还）。
        const isLoanOffset = claim.payMethod === enums_1.ExpensePayMethod.ADVANCE &&
            (claim.claimType === enums_1.ExpenseClaimType.LOAN_OFFSET || Boolean(claim.loanId));
        if (isLoanOffset) {
            await this.settlementService.registerExisting({
                settleType: 'expense_claim',
                sourceId: id,
                sourceNo: claim.claimNo,
                loanId: claim.loanId ?? undefined,
                employeeId: claim.employeeId,
                amount: Number(claim.totalAmount),
                settleDate: claim.claimDate,
                summary: `${claim.employeeName}报销抵充借款`,
                // 复用审核已生成的凭证，不重复出账
                voucherId: voucher.id,
                remark: `报销单 ${claim.claimNo} 抵充借款`,
            }, operator);
        }
        return this.findOne(id);
    }
    /** 付款：生成付款凭证 */
    async pay(id, dto, operator) {
        const claim = await this.findEntity(id);
        if (claim.status !== enums_1.ExpenseClaimStatus.APPROVED) {
            throw new common_1.BadRequestException('仅已审核的报销单可以付款');
        }
        if (claim.payMethod === enums_1.ExpensePayMethod.ADVANCE) {
            const isLoanOffset = claim.claimType === enums_1.ExpenseClaimType.LOAN_OFFSET || Boolean(claim.loanId);
            if (isLoanOffset) {
                // 冲抵借款型：审核时已贷「其他应收款-员工」抵充借款，无需再付款
                throw new common_1.BadRequestException('当前为「冲抵借款」报销单，审核时已抵充员工借款，无需再付款');
            }
            // 直接付款型垫付挂账：审核时已贷「其他应收款-员工」，付款时借回并支付给员工
        }
        // 未指定付款账户时，按支付方式回退到默认资金科目
        const bankAccountId = dto.bankAccountId ?? claim.bankAccountId;
        let bankAccount;
        if (bankAccountId) {
            const bank = await this.bankRepo.findOne({ where: { id: bankAccountId } });
            if (!bank)
                throw new common_1.BadRequestException('付款账户不存在');
            bankAccount = await this.resolveAccountOfBank(bank);
        }
        else {
            const code = claim.payMethod === enums_1.ExpensePayMethod.CASH ? DEFAULT_CASH_CODE : DEFAULT_BANK_CODE;
            bankAccount = await this.requireAccount(code);
        }
        const advanceAccount = await this.requireAccount(DEFAULT_ADVANCE_CODE);
        const summary = `支付${claim.employeeName}报销`;
        const voucher = await this.vouchersService.createFromSystem({
            word: enums_1.VoucherWord.GENERAl,
            voucherDate: dto.payDate ?? new Date().toISOString().slice(0, 10),
            entries: [
                // 借 其他应收款-员工（挂员工辅助核算冲平垫付挂账）
                { summary, accountId: advanceAccount.id, employeeId: claim.employeeId, debit: Number(claim.totalAmount) },
                { summary, accountId: bankAccount.id, credit: Number(claim.totalAmount) },
            ],
            remark: dto.remark ?? `报销单 ${claim.claimNo} 付款`,
            sourceType: enums_1.VoucherSource.EXPENSE_CLAIM,
            sourceId: id,
            autoApprove: true,
        }, operator);
        claim.status = enums_1.ExpenseClaimStatus.PAID;
        claim.payVoucherId = voucher.id;
        claim.paidAt = new Date();
        claim.bankAccountId = bankAccountId ?? null;
        claim.bankAccountName = bankAccount.name;
        await this.repo.save(claim);
        return this.findOne(id);
    }
    /** 驳回 */
    async reject(id, reason) {
        const claim = await this.findEntity(id);
        this.assertDraft(claim, '驳回');
        claim.status = enums_1.ExpenseClaimStatus.REJECTED;
        claim.remark = `驳回原因：${reason}`;
        await this.repo.save(claim);
        return this.findOne(id);
    }
    async remove(id) {
        const claim = await this.findEntity(id);
        if (claim.status === enums_1.ExpenseClaimStatus.PAID) {
            throw new common_1.BadRequestException('已付款的报销单不可删除');
        }
        // 已审核但未付款：先撤销凭证，并回滚对应的借款核销
        if (claim.voucherId) {
            const voucher = await this.voucherRepo.findOne({ where: { id: claim.voucherId } });
            if (voucher) {
                if (voucher.status === enums_1.VoucherStatus.APPROVED) {
                    await this.vouchersService.unapprove(voucher.id);
                }
                await this.vouchersService.remove(voucher.id);
            }
        }
        await this.settlementService.cancelBySource('expense_claim', id);
        await this.itemRepo.delete({ claimId: id });
        await this.repo.delete({ id });
        return { message: '删除成功' };
    }
    // ==================== 内部 ====================
    async findEntity(id) {
        const claim = await this.repo.findOne({ where: { id } });
        if (!claim)
            throw new common_1.NotFoundException('报销单不存在');
        return claim;
    }
    assertDraft(claim, action) {
        if (claim.status !== enums_1.ExpenseClaimStatus.DRAFT) {
            throw new common_1.BadRequestException(`当前状态为「${this.statusLabel(claim.status)}」，不可${action}`);
        }
    }
    async saveItems(claimId, items, defaultAccount) {
        const rows = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if ((0, money_util_1.toCents)(item.amount) <= 0) {
                throw new common_1.BadRequestException(`第 ${i + 1} 行：金额必须大于 0`);
            }
            const accountId = item.accountId ?? defaultAccount?.id ?? null;
            let accountCode = null;
            let accountName = null;
            if (accountId) {
                const account = await this.accountRepo.findOne({ where: { id: accountId } });
                if (!account)
                    throw new common_1.BadRequestException(`第 ${i + 1} 行：费用科目不存在`);
                if (!account.isLeaf) {
                    throw new common_1.BadRequestException(`第 ${i + 1} 行：科目「${account.fullName}」不是明细科目`);
                }
                if (account.status !== 1) {
                    throw new common_1.BadRequestException(`第 ${i + 1} 行：科目「${account.fullName}」已禁用`);
                }
                accountCode = account.code;
                accountName = account.name;
            }
            rows.push(this.itemRepo.create({
                claimId,
                summary: item.summary ?? '',
                accountId,
                accountCode,
                accountName,
                amount: item.amount,
                remark: item.remark ?? null,
                sort: i + 1,
            }));
        }
        await this.itemRepo.save(rows);
    }
    async resolveContext(dto) {
        const employee = await this.employeeRepo.findOne({ where: { id: dto.employeeId } });
        if (!employee)
            throw new common_1.BadRequestException('员工不存在');
        if (employee.status !== 1)
            throw new common_1.BadRequestException('该员工已离职，无法提交报销');
        let departmentName = null;
        if (employee.departmentId) {
            const dept = await this.deptRepo.findOne({ where: { id: employee.departmentId } });
            departmentName = dept?.name ?? null;
        }
        let totalCents = 0;
        for (const [index, item] of dto.items.entries()) {
            if ((0, money_util_1.toCents)(item.amount) <= 0) {
                throw new common_1.BadRequestException(`第 ${index + 1} 行：金额必须大于 0`);
            }
            totalCents += (0, money_util_1.toCents)(item.amount);
        }
        if (totalCents <= 0)
            throw new common_1.BadRequestException('报销金额必须大于 0');
        // 默认费用科目
        let defaultExpenseAccount = null;
        const needsDefault = dto.items.some((i) => !i.accountId);
        if (needsDefault) {
            defaultExpenseAccount = await this.accountRepo.findOne({
                where: { code: DEFAULT_EXPENSE_CODE },
            });
            if (!defaultExpenseAccount) {
                throw new common_1.BadRequestException(`存在未指定费用科目的明细行，请为每行指定科目，或先确认默认科目 ${DEFAULT_EXPENSE_CODE} 存在`);
            }
        }
        // 付款账户
        let bankAccount = null;
        if (dto.bankAccountId) {
            bankAccount = await this.bankRepo.findOne({ where: { id: dto.bankAccountId } });
            if (!bankAccount)
                throw new common_1.BadRequestException('付款账户不存在');
        }
        return {
            employee,
            departmentName,
            defaultExpenseAccount,
            bankAccount,
            totalAmount: (0, money_util_1.fromCents)(totalCents),
        };
    }
    /** 构造报销贷方分录 */
    /** 贷方：员工垫付挂「其他应收款-员工」并挂员工辅助核算，便于按员工拆分往来余额 */
    async buildCreditEntry(claim, summary) {
        const amount = Number(claim.totalAmount);
        if (claim.payMethod === enums_1.ExpensePayMethod.ADVANCE) {
            const advance = await this.requireAccount(DEFAULT_ADVANCE_CODE);
            return { summary, accountId: advance.id, credit: amount, employeeId: claim.employeeId };
        }
        const code = claim.payMethod === enums_1.ExpensePayMethod.CASH ? DEFAULT_CASH_CODE : DEFAULT_BANK_CODE;
        const account = await this.requireAccount(code);
        return { summary, accountId: account.id, credit: amount };
    }
    async resolveAccountOfBank(bank) {
        if (!bank.accountCode) {
            throw new common_1.BadRequestException(`资金账户「${bank.name}」未关联会计科目`);
        }
        const account = await this.accountRepo.findOne({ where: { code: bank.accountCode } });
        if (!account) {
            throw new common_1.BadRequestException(`资金账户「${bank.name}」关联的科目 ${bank.accountCode} 不存在`);
        }
        if (!account.isLeaf) {
            throw new common_1.BadRequestException(`资金账户关联科目「${account.fullName}」不是明细科目`);
        }
        return account;
    }
    async requireAccount(code) {
        const account = await this.accountRepo.findOne({ where: { code } });
        if (!account) {
            throw new common_1.BadRequestException(`系统默认科目「${code}」不存在，请在「会计科目」中确认`);
        }
        if (!account.isLeaf) {
            throw new common_1.BadRequestException(`系统默认科目「${code}」不是明细科目`);
        }
        return account;
    }
    statusLabel(status) {
        switch (status) {
            case enums_1.ExpenseClaimStatus.DRAFT:
                return '草稿';
            case enums_1.ExpenseClaimStatus.APPROVED:
                return '已审核';
            case enums_1.ExpenseClaimStatus.PAID:
                return '已付款';
            case enums_1.ExpenseClaimStatus.REJECTED:
                return '已驳回';
            default:
                return status;
        }
    }
    toVo(claim, items) {
        return {
            id: claim.id,
            claimNo: claim.claimNo,
            claimDate: claim.claimDate,
            employeeId: claim.employeeId,
            employeeName: claim.employeeName,
            departmentId: claim.departmentId,
            departmentName: claim.departmentName,
            totalAmount: claim.totalAmount,
            payMethod: claim.payMethod,
            claimType: claim.claimType,
            claimTypeLabel: claim.claimType === enums_1.ExpenseClaimType.LOAN_OFFSET ? '冲抵借款' : '直接付款',
            loanId: claim.loanId,
            loanNo: claim.loanNo,
            status: claim.status,
            statusLabel: this.statusLabel(claim.status),
            expenseAccountId: claim.expenseAccountId,
            expenseAccountName: claim.expenseAccountName,
            bankAccountId: claim.bankAccountId,
            bankAccountName: claim.bankAccountName,
            voucherId: claim.voucherId,
            payVoucherId: claim.payVoucherId,
            createdByName: claim.createdByName,
            approvedAt: claim.approvedAt,
            paidAt: claim.paidAt,
            remark: claim.remark,
            createdAt: claim.createdAt,
            items: items.map((i) => ({
                id: i.id,
                summary: i.summary,
                accountId: i.accountId,
                accountCode: i.accountCode,
                accountName: i.accountName,
                amount: i.amount,
                remark: i.remark,
                sort: i.sort,
            })),
        };
    }
    /** 供工资/其他模块复用：查询某员工的报销记录数 */
    async countByEmployee(employeeId) {
        return this.repo.count({ where: { employeeId } });
    }
    /** 校验报销单关联的凭证是否仍然有效（用于外键约束检查） */
    async assertNoVoucher(id) {
        const claim = await this.findEntity(id);
        if (claim.voucherId) {
            throw new common_1.ConflictException('该报销单已生成凭证，无法删除');
        }
    }
};
exports.ExpenseClaimsService = ExpenseClaimsService;
exports.ExpenseClaimsService = ExpenseClaimsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, company_repo_decorator_1.InjectCompanyRepo)(hr_entity_1.ExpenseClaim)),
    __param(1, (0, company_repo_decorator_1.InjectCompanyRepo)(hr_entity_1.ExpenseClaimItem)),
    __param(2, (0, company_repo_decorator_1.InjectCompanyRepo)(hr_entity_2.Employee)),
    __param(3, (0, company_repo_decorator_1.InjectCompanyRepo)(department_entity_1.Department)),
    __param(4, (0, company_repo_decorator_1.InjectCompanyRepo)(account_entity_1.Account)),
    __param(5, (0, company_repo_decorator_1.InjectCompanyRepo)(bank_account_entity_1.BankAccount)),
    __param(6, (0, company_repo_decorator_1.InjectCompanyRepo)(voucher_entity_1.Voucher)),
    __metadata("design:paramtypes", [company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        vouchers_service_1.VouchersService,
        employee_settlement_service_1.EmployeeSettlementService])
], ExpenseClaimsService);
