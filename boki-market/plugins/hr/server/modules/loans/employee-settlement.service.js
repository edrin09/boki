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
exports.EmployeeSettlementService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const hr_entity_1 = require("@core/entities/hr.entity");
const voucher_entity_1 = require("@core/entities/voucher.entity");
const enums_1 = require("@core/common/enums");
const money_util_1 = require("@core/common/utils/money.util");
const company_repository_1 = require("@core/common/company/company.repository");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
const vouchers_service_1 = require("@core/modules/vouchers/vouchers.service");
/** 现金/银行实际还款走 repaidAmount，其余（报销/发票/工资扣回）走 offsetAmount */
const CASH_LIKE_SETTLE_TYPES = new Set(['cash', 'bank']);
/**
 * 员工往来核销服务
 *
 * 统一处理「其他应收款-员工借款」的贷方核销。现金/银行还款、报销抵充、
 * 采购发票抵充、工资扣回都走这里，保证核销流水与借款单已清偿金额始终一致。
 *
 * 记账口径：
 * - cash/bank      实际收现 → 借款单 repaidAmount
 * - 其余途径        非现金抵充 → 借款单 offsetAmount
 * 借款总清偿 = repaidAmount + offsetAmount。
 */
let EmployeeSettlementService = class EmployeeSettlementService {
    repo;
    loanRepo;
    employeeRepo;
    voucherRepo;
    vouchersService;
    constructor(repo, loanRepo, employeeRepo, voucherRepo, vouchersService) {
        this.repo = repo;
        this.loanRepo = loanRepo;
        this.employeeRepo = employeeRepo;
        this.voucherRepo = voucherRepo;
        this.vouchersService = vouchersService;
    }
    /**
     * 执行一笔借款核销：
     * 1. 校验借款单可抵充（未还清）
     * 2. 生成凭证（借方由调用方给，贷方固定 1221 且挂员工辅助核算）
     * 3. 登记核销流水（唯一键 settleType+sourceId 保证幂等）
     * 4. 回写借款单：现金/银行还款累加 repaidAmount，其余累加 offsetAmount
     */
    async settle(input, operator) {
        const amountCents = (0, money_util_1.toCents)(input.amount);
        if (amountCents <= 0) {
            throw new common_1.BadRequestException('核销金额必须大于 0');
        }
        // 幂等：同一来源单据只允许核销一次
        const existed = await this.repo.findOne({
            where: { settleType: input.settleType, sourceId: input.sourceId },
        });
        if (existed) {
            throw new common_1.BadRequestException('该单据已完成借款核销，请勿重复操作');
        }
        let loan = null;
        if (input.loanId) {
            loan = await this.loanRepo.findOne({ where: { id: input.loanId } });
            if (!loan)
                throw new common_1.BadRequestException('要抵充的借款单不存在');
            const outstanding = this.outstandingOf(loan);
            if (outstanding <= 0) {
                throw new common_1.BadRequestException(`借款单「${loan.loanNo}」已还清，无法继续抵充`);
            }
            if (amountCents > outstanding) {
                throw new common_1.BadRequestException(`抵充金额不能超过借款单「${loan.loanNo}」剩余未还金额 ${(outstanding / 100).toFixed(2)} 元`);
            }
        }
        const employeeId = input.debitEntry.employeeId ?? loan?.employeeId;
        if (!employeeId) {
            throw new common_1.BadRequestException('无法确定核销员工，请检查员工辅助核算');
        }
        // 贷方固定 1221（其他应收款-员工），挂员工辅助核算以便按员工拆分余额
        const creditEntry = {
            summary: input.summary,
            accountId: input.receivableAccountId,
            employeeId,
            credit: amountCents / 100,
        };
        const voucher = await this.vouchersService.createFromSystem({
            word: enums_1.VoucherWord.GENERAl,
            voucherDate: input.settleDate,
            entries: [input.debitEntry, creditEntry],
            remark: input.remark ?? `员工往来核销 ${input.sourceNo ?? input.sourceId}`,
            sourceType: enums_1.VoucherSource.EMPLOYEE_SETTLEMENT,
            sourceId: input.sourceId,
            autoApprove: true,
        }, operator);
        const record = this.repo.create({
            settleType: input.settleType,
            sourceId: input.sourceId,
            sourceNo: input.sourceNo ?? null,
            employeeId,
            employeeName: await this.resolveEmployeeName(employeeId, loan?.employeeName),
            loanId: loan?.id ?? null,
            loanNo: loan?.loanNo ?? null,
            settleDate: input.settleDate,
            amount: amountCents / 100,
            summary: input.summary,
            voucherId: voucher.id,
            createdBy: operator.id,
            createdByName: operator.nickname,
            remark: input.remark ?? null,
        });
        const saved = await this.repo.save(record);
        if (loan) {
            await this.applyToLoan(loan, amountCents, input.settleType);
        }
        return saved;
    }
    /**
     * 登记一笔「复用已有凭证」的核销：
     * 报销/采购发票/工资发放审核时已生成凭证（贷 1221），
     * 这里只补登记核销流水并回写借款单，不重复出账。
     *
     * loanId 为空时按 FIFO 自动分配到员工所有未还清借款单（可能产生多条流水）；
     * 分配完仍有余额时，余额登记为无借款挂账流水。
     */
    async registerExisting(input, operator) {
        const amountCents = (0, money_util_1.toCents)(input.amount);
        if (amountCents <= 0) {
            throw new common_1.BadRequestException('核销金额必须大于 0');
        }
        // 幂等：同一来源单据只登记一次
        const existed = await this.repo.findOne({
            where: { settleType: input.settleType, sourceId: input.sourceId },
        });
        if (existed)
            return existed;
        const employeeName = await this.resolveEmployeeName(input.employeeId);
        // 显式指定借款单：单笔核销并校验余额
        if (input.loanId) {
            const loan = await this.loanRepo.findOne({ where: { id: input.loanId } });
            if (!loan)
                throw new common_1.BadRequestException('要抵充的借款单不存在');
            const outstanding = this.outstandingOf(loan);
            if (outstanding <= 0) {
                throw new common_1.BadRequestException(`借款单「${loan.loanNo}」已还清，无法继续抵充`);
            }
            if (amountCents > outstanding) {
                throw new common_1.BadRequestException(`抵充金额不能超过借款单「${loan.loanNo}」剩余未还金额 ${(outstanding / 100).toFixed(2)} 元`);
            }
            return this.saveSettlement(input, employeeName, loan, amountCents, operator);
        }
        // FIFO：按借款日期先后自动分配（先借先还），直到金额分完
        const loans = await this.loanRepo.find({
            where: { employeeId: input.employeeId, status: (0, typeorm_1.In)([enums_1.LoanStatus.APPROVED, enums_1.LoanStatus.REPAID]) },
            order: { loanDate: 'ASC' },
        });
        let remaining = amountCents;
        const records = [];
        for (const loan of loans) {
            if (remaining <= 0)
                break;
            const outstanding = this.outstandingOf(loan);
            if (outstanding <= 0)
                continue;
            const applied = Math.min(outstanding, remaining);
            records.push(await this.saveSettlement(input, employeeName, loan, applied, operator));
            remaining -= applied;
        }
        // 员工没有未还清借款（纯垫付）或金额超出欠款总额：余额登记为无借款挂账流水
        if (remaining > 0) {
            records.push(await this.saveSettlement(input, employeeName, null, remaining, operator));
        }
        return records;
    }
    /** 撤销来源单据的全部核销：回滚借款单 → 删凭证 → 删流水 */
    async cancelBySource(settleType, sourceId) {
        const records = await this.repo.find({ where: { settleType, sourceId } });
        if (!records.length)
            return;
        for (const record of records) {
            if (record.loanId) {
                const loan = await this.loanRepo.findOne({ where: { id: record.loanId } });
                if (loan) {
                    await this.rollbackLoan(loan, (0, money_util_1.toCents)(Number(record.amount)), record.settleType);
                }
            }
        }
        const voucherIds = [...new Set(records.map((r) => r.voucherId).filter(Boolean))];
        for (const voucherId of voucherIds) {
            const voucher = await this.voucherRepo.findOne({ where: { id: voucherId } });
            if (voucher) {
                if (voucher.status === enums_1.VoucherStatus.APPROVED) {
                    await this.vouchersService.unapprove(voucher.id);
                }
                await this.vouchersService.remove(voucher.id);
            }
        }
        await this.repo.delete({ id: (0, typeorm_1.In)(records.map((r) => r.id)) });
    }
    /**
     * 按员工汇总未还清借款余额（元）。
     * 仅统计已发放（已借款/已还清）的借款单，供工资单生成时自动预填「借款扣回」。
     */
    async outstandingMapByEmployees(employeeIds) {
        const map = new Map();
        if (!employeeIds.length)
            return map;
        const loans = await this.loanRepo.find({
            where: {
                employeeId: (0, typeorm_1.In)(employeeIds),
                status: (0, typeorm_1.In)([enums_1.LoanStatus.APPROVED, enums_1.LoanStatus.REPAID]),
            },
        });
        for (const loan of loans) {
            const outstanding = this.outstandingOf(loan);
            if (outstanding <= 0)
                continue;
            map.set(loan.employeeId, (map.get(loan.employeeId) ?? 0) + outstanding);
        }
        return new Map(Array.from(map, ([id, cents]) => [id, cents / 100]));
    }
    /** 借款单剩余未清偿金额（分）：现金还款与非现金抵充都算已清偿 */
    outstandingOf(loan) {
        return ((0, money_util_1.toCents)(Number(loan.amount)) -
            (0, money_util_1.toCents)(Number(loan.repaidAmount ?? 0)) -
            (0, money_util_1.toCents)(Number(loan.offsetAmount ?? 0)));
    }
    settleTypeLabel(type) {
        return ({
            cash: '现金还款',
            bank: '银行还款',
            expense_claim: '报销抵充',
            receipt: '采购发票抵充',
            payroll: '工资扣回',
        }[type] ?? type);
    }
    /** 按员工汇总往来余额 */
    async employeeBalances(query) {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        const qb = this.loanRepo.createQueryBuilder('l');
        // 只有已发放（已借款/已还清）的借款单才形成员工往来余额；
        // 待审核/已驳回的借款单尚未出账，不计入
        qb.andWhere('l.status IN (:...statuses)', { statuses: [enums_1.LoanStatus.APPROVED, enums_1.LoanStatus.REPAID] });
        if (query.keyword) {
            qb.andWhere(new typeorm_1.Brackets((w) => {
                w.where('l.employeeName LIKE :kw', { kw: `%${query.keyword}%` })
                    .orWhere('l.employeeId LIKE :kw', { kw: `%${query.keyword}%` });
            }));
        }
        const loans = await qb.orderBy('l.loanDate', 'DESC').getMany();
        const map = new Map();
        for (const l of loans) {
            const row = map.get(l.employeeId) ??
                {
                    employeeId: l.employeeId,
                    employeeName: l.employeeName,
                    loanCount: 0,
                    loanTotal: 0,
                    repaidTotal: 0,
                    offsetTotal: 0,
                    balance: 0,
                };
            row.loanCount += 1;
            row.loanTotal += (0, money_util_1.toCents)(Number(l.amount)) / 100;
            row.repaidTotal += (0, money_util_1.toCents)(Number(l.repaidAmount ?? 0)) / 100;
            row.offsetTotal += (0, money_util_1.toCents)(Number(l.offsetAmount ?? 0)) / 100;
            map.set(l.employeeId, row);
        }
        for (const row of map.values()) {
            row.balance = Math.round((row.loanTotal - row.repaidTotal - row.offsetTotal) * 100) / 100;
        }
        const all = Array.from(map.values()).sort((a, b) => b.balance - a.balance);
        const start = (page - 1) * pageSize;
        return { list: all.slice(start, start + pageSize), total: all.length, page, pageSize };
    }
    /** 借款核销流水 */
    async settlements(query) {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        const qb = this.repo.createQueryBuilder('s');
        if (query.employeeId)
            qb.andWhere('s.employeeId = :employeeId', { employeeId: query.employeeId });
        if (query.loanId)
            qb.andWhere('s.loanId = :loanId', { loanId: query.loanId });
        const [list, total] = await qb
            .orderBy('s.settleDate', 'DESC')
            .addOrderBy('s.createdAt', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize)
            .getManyAndCount();
        return {
            list: list.map((s) => ({
                id: s.id,
                settleType: s.settleType,
                settleTypeLabel: this.settleTypeLabel(s.settleType),
                sourceId: s.sourceId,
                sourceNo: s.sourceNo,
                employeeId: s.employeeId,
                employeeName: s.employeeName,
                loanId: s.loanId,
                loanNo: s.loanNo,
                settleDate: s.settleDate,
                amount: s.amount,
                summary: s.summary,
                voucherId: s.voucherId,
                createdByName: s.createdByName,
                createdAt: s.createdAt,
            })),
            total,
            page,
            pageSize,
        };
    }
    // ==================== 内部 ====================
    /** 落一条核销流水并回写借款单（金额单位：分） */
    async saveSettlement(input, employeeName, loan, amountCents, operator) {
        const record = this.repo.create({
            settleType: input.settleType,
            sourceId: input.sourceId,
            sourceNo: input.sourceNo ?? null,
            employeeId: input.employeeId,
            employeeName,
            loanId: loan?.id ?? null,
            loanNo: loan?.loanNo ?? null,
            settleDate: input.settleDate,
            amount: amountCents / 100,
            summary: loan ? `${input.summary}（抵充 ${loan.loanNo}）` : input.summary,
            voucherId: input.voucherId ?? null,
            createdBy: operator.id,
            createdByName: operator.nickname,
            remark: input.remark ?? null,
        });
        const saved = await this.repo.save(record);
        if (loan) {
            await this.applyToLoan(loan, amountCents, input.settleType);
        }
        return saved;
    }
    /** 员工姓名：优先借款单快照，其次查员工档案，查不到兜底空串 */
    async resolveEmployeeName(employeeId, snapshot) {
        if (snapshot)
            return snapshot;
        const employee = await this.employeeRepo.findOne({ where: { id: employeeId } });
        return employee?.name ?? '';
    }
    /** 核销后回写借款单：现金/银行还款累加 repaidAmount，其余累加 offsetAmount；还清则置「已还款」 */
    async applyToLoan(loan, amountCents, settleType) {
        if (CASH_LIKE_SETTLE_TYPES.has(settleType)) {
            const repaidTotal = (0, money_util_1.toCents)(Number(loan.repaidAmount ?? 0)) + amountCents;
            loan.repaidAmount = repaidTotal / 100;
        }
        else {
            const offsetTotal = (0, money_util_1.toCents)(Number(loan.offsetAmount ?? 0)) + amountCents;
            loan.offsetAmount = offsetTotal / 100;
        }
        if (this.outstandingOf(loan) <= 0 && loan.status === enums_1.LoanStatus.APPROVED) {
            loan.status = enums_1.LoanStatus.REPAID;
            loan.repaidAt = new Date();
        }
        await this.loanRepo.save(loan);
    }
    /** 撤销后回滚借款单已清偿金额（方向与核销途径一致），未还清则恢复「已借款」 */
    async rollbackLoan(loan, amountCents, settleType) {
        if (CASH_LIKE_SETTLE_TYPES.has(settleType)) {
            const repaidTotal = Math.max(0, (0, money_util_1.toCents)(Number(loan.repaidAmount ?? 0)) - amountCents);
            loan.repaidAmount = repaidTotal / 100;
        }
        else {
            const offsetTotal = Math.max(0, (0, money_util_1.toCents)(Number(loan.offsetAmount ?? 0)) - amountCents);
            loan.offsetAmount = offsetTotal / 100;
        }
        if (loan.status === enums_1.LoanStatus.REPAID && this.outstandingOf(loan) > 0) {
            loan.status = enums_1.LoanStatus.APPROVED;
            loan.repaidAt = null;
        }
        await this.loanRepo.save(loan);
    }
};
exports.EmployeeSettlementService = EmployeeSettlementService;
exports.EmployeeSettlementService = EmployeeSettlementService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, company_repo_decorator_1.InjectCompanyRepo)(hr_entity_1.EmployeeSettlement)),
    __param(1, (0, company_repo_decorator_1.InjectCompanyRepo)(hr_entity_1.Loan)),
    __param(2, (0, company_repo_decorator_1.InjectCompanyRepo)(hr_entity_1.Employee)),
    __param(3, (0, company_repo_decorator_1.InjectCompanyRepo)(voucher_entity_1.Voucher)),
    __metadata("design:paramtypes", [company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        vouchers_service_1.VouchersService])
], EmployeeSettlementService);
