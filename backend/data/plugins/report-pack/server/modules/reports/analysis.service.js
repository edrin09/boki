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
exports.AnalysisService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const company_repository_1 = require("@core/common/company/company.repository");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
const account_entity_1 = require("@core/entities/account.entity");
const voucher_entity_1 = require("@core/entities/voucher.entity");
const voucher_entry_entity_1 = require("@core/entities/voucher-entry.entity");
const receipt_entity_1 = require("@core/entities/receipt.entity");
const partner_entity_1 = require("@core/entities/partner.entity");
const hr_entity_1 = require("@core/entities/hr.entity");
const fixed_expense_entity_1 = require("@core/entities/fixed-expense.entity");
const enums_1 = require("@core/common/enums");
const money_util_1 = require("@core/common/utils/money.util");
const date_util_1 = require("@core/common/utils/date.util");
const books_service_1 = require("@core/modules/books/books.service");
const reports_service_1 = require("./reports.service");
/** 现金流分类规则：按对方科目编码前缀/整段匹配（自上而下优先） */
const INVESTING_PREFIXES = ['1511', '1601', '1604', '1701', '1501', '1101', '1521', '1512', '1602', '1603'];
const FINANCING_CODES = ['2001', '2501', '4001', '4002', '4101', '2232', '2231'];
/** 费用分析涉及的损益类费用科目一级编码 */
const EXPENSE_CODES = ['6401', '6301', '6601', '6602', '6603', '6701', '6801'];
const emptyCategory = (key, title) => ({
    key,
    title,
    inflow: 0,
    outflow: 0,
});
let AnalysisService = class AnalysisService {
    accountRepo;
    voucherRepo;
    entryRepo;
    receiptRepo;
    partnerRepo;
    payrollRepo;
    expenseClaimRepo;
    fixedExpenseRepo;
    fixedExpenseLogRepo;
    booksService;
    reportsService;
    constructor(accountRepo, voucherRepo, entryRepo, receiptRepo, partnerRepo, payrollRepo, expenseClaimRepo, fixedExpenseRepo, fixedExpenseLogRepo, booksService, reportsService) {
        this.accountRepo = accountRepo;
        this.voucherRepo = voucherRepo;
        this.entryRepo = entryRepo;
        this.receiptRepo = receiptRepo;
        this.partnerRepo = partnerRepo;
        this.payrollRepo = payrollRepo;
        this.expenseClaimRepo = expenseClaimRepo;
        this.fixedExpenseRepo = fixedExpenseRepo;
        this.fixedExpenseLogRepo = fixedExpenseLogRepo;
        this.booksService = booksService;
        this.reportsService = reportsService;
    }
    // ==================== P18.1 票据台账 ====================
    async receiptLedger(query) {
        const endPeriod = query.endPeriod ?? (0, date_util_1.currentPeriod)();
        const startPeriod = query.startPeriod ?? endPeriod;
        if (startPeriod > endPeriod) {
            return this.throwPeriodError();
        }
        const { startDate, endDate } = (0, date_util_1.periodToRange)(startPeriod);
        const endOfEnd = (0, date_util_1.periodEndDate)(endPeriod);
        const startOfStart = (0, date_util_1.periodStartDate)(startPeriod);
        const qb = this.receiptRepo
            .createQueryBuilder('r')
            .where('r.status NOT IN (:...excluded)', {
            excluded: [enums_1.ReceiptStatus.DUPLICATE, enums_1.ReceiptStatus.FAILED],
        })
            .andWhere('(r.issueDate IS NULL OR r.issueDate >= :startDate)', { startDate: startOfStart })
            .andWhere('r.issueDate <= :endDate', { endDate: endOfEnd });
        if (query.receiptType) {
            qb.andWhere('r.receiptType = :receiptType', { receiptType: query.receiptType });
        }
        if (query.keyword) {
            qb.andWhere('(r.fileName LIKE :kw OR r.sellerName LIKE :kw OR r.buyerName LIKE :kw)', {
                kw: `%${query.keyword}%`,
            });
        }
        const rows = await qb.orderBy('r.issueDate', 'ASC').addOrderBy('r.createdAt', 'ASC').getMany();
        /** 按票据类型分组汇总 */
        const byType = new Map();
        let amount = 0;
        let taxAmount = 0;
        for (const r of rows) {
            const key = r.receiptType || 'unknown';
            const g = byType.get(key) ?? {
                type: key,
                typeName: r.receiptTypeName || '未识别',
                count: 0,
                amount: 0,
                taxAmount: 0,
            };
            g.count += 1;
            g.amount = (0, money_util_1.fromCents)((0, money_util_1.toCents)(g.amount) + (0, money_util_1.toCents)(r.amount ?? 0));
            g.taxAmount = (0, money_util_1.fromCents)((0, money_util_1.toCents)(g.taxAmount) + (0, money_util_1.toCents)(r.taxAmount ?? 0));
            byType.set(key, g);
            amount = (0, money_util_1.fromCents)((0, money_util_1.toCents)(amount) + (0, money_util_1.toCents)(r.amount ?? 0));
            taxAmount = (0, money_util_1.fromCents)((0, money_util_1.toCents)(taxAmount) + (0, money_util_1.toCents)(r.taxAmount ?? 0));
        }
        return {
            title: '票据台账',
            period: { startPeriod, endPeriod },
            startDate: startOfStart,
            endDate: endOfEnd,
            summary: {
                count: rows.length,
                amount,
                taxAmount,
                byType: Array.from(byType.values()).sort((a, b) => b.amount - a.amount),
            },
            rows: rows.map((r) => ({
                id: r.id,
                fileName: r.fileName,
                receiptType: r.receiptType,
                receiptTypeName: r.receiptTypeName,
                issueDate: r.issueDate,
                amount: r.amount,
                taxAmount: r.taxAmount,
                invoiceNo: r.invoiceNo,
                sellerName: r.sellerName,
                buyerName: r.buyerName,
                status: r.status,
                statusLabel: this.receiptStatusLabel(r.status),
                voucherId: r.voucherId,
                confirmedAt: r.confirmedAt,
                rejectedAt: r.rejectedAt,
            })),
        };
    }
    // ==================== P18.2 现金流量简表 ====================
    async cashFlow(query) {
        const endPeriod = query.endPeriod ?? (0, date_util_1.currentPeriod)();
        const startPeriod = query.startPeriod ?? endPeriod;
        if (startPeriod > endPeriod) {
            return this.throwPeriodError();
        }
        const fiscalYear = query.fiscalYear ?? (0, date_util_1.periodToYear)(endPeriod);
        const includeUnapproved = query.includeUnapproved ?? false;
        const accounts = await this.accountRepo.find();
        const accountMap = new Map(accounts.map((a) => [a.id, a]));
        const parentMap = new Map();
        for (const a of accounts)
            parentMap.set(a.id, a.parentId);
        /** 科目自身或其祖先是否为现金/银行科目 */
        const isCashAccount = (accountId) => {
            let cursor = accountId;
            const guard = new Set();
            while (cursor && !guard.has(cursor)) {
                guard.add(cursor);
                const acc = accountMap.get(cursor);
                if (!acc)
                    return false;
                if (acc.isCash || acc.isBank)
                    return true;
                cursor = parentMap.get(cursor) ?? null;
            }
            return false;
        };
        /** 现金流分类 */
        const classify = (code) => {
            for (const prefix of INVESTING_PREFIXES) {
                if (code.startsWith(prefix))
                    return 'investing';
            }
            for (const codeOf of FINANCING_CODES) {
                if (code.startsWith(codeOf))
                    return 'financing';
            }
            return 'operating';
        };
        const categories = {
            operating: emptyCategory('operating', '经营活动'),
            investing: emptyCategory('investing', '投资活动'),
            financing: emptyCategory('financing', '筹资活动'),
        };
        // 期间内已审核凭证
        const voucherQb = this.voucherRepo
            .createQueryBuilder('v')
            .where('v.period >= :startPeriod AND v.period <= :endPeriod', { startPeriod, endPeriod });
        if (!includeUnapproved) {
            voucherQb.andWhere('v.status = :status', { status: enums_1.VoucherStatus.APPROVED });
        }
        else {
            voucherQb.andWhere('v.status IN (:...statuses)', {
                statuses: [enums_1.VoucherStatus.APPROVED, enums_1.VoucherStatus.DRAFT],
            });
        }
        const vouchers = await voucherQb.orderBy('v.voucherDate', 'ASC').addOrderBy('v.voucherNo', 'ASC').getMany();
        const detail = [];
        if (vouchers.length) {
            const entries = await this.entryRepo
                .createQueryBuilder('e')
                .where('e.voucherId IN (:...ids)', { ids: vouchers.map((v) => v.id) })
                .orderBy('e.sort', 'ASC')
                .getMany();
            const byVoucher = new Map();
            for (const e of entries) {
                const arr = byVoucher.get(e.voucherId) ?? [];
                arr.push(e);
                byVoucher.set(e.voucherId, arr);
            }
            for (const v of vouchers) {
                const es = byVoucher.get(v.id) ?? [];
                const cashIds = new Set(es.filter((e) => isCashAccount(e.accountId)).map((e) => e.id));
                if (cashIds.size === 0)
                    continue;
                const hasCashFlow = es.some((e) => cashIds.has(e.id) && ((0, money_util_1.toCents)(e.debit) > 0 || (0, money_util_1.toCents)(e.credit) > 0));
                if (!hasCashFlow)
                    continue;
                // 对方分录：现金借方对应流入（对方贷方），现金贷方对应流出（对方借方）
                const direction = { inflow: 0, outflow: 0 };
                for (const e of es) {
                    if (cashIds.has(e.id))
                        continue;
                    const cat = classify(e.accountCode);
                    const debit = (0, money_util_1.toCents)(e.debit);
                    const credit = (0, money_util_1.toCents)(e.credit);
                    if (debit > 0) {
                        categories[cat].outflow = (0, money_util_1.fromCents)((0, money_util_1.toCents)(categories[cat].outflow) + debit);
                        direction.outflow = (0, money_util_1.fromCents)((0, money_util_1.toCents)(direction.outflow) + debit);
                    }
                    if (credit > 0) {
                        categories[cat].inflow = (0, money_util_1.fromCents)((0, money_util_1.toCents)(categories[cat].inflow) + credit);
                        direction.inflow = (0, money_util_1.fromCents)((0, money_util_1.toCents)(direction.inflow) + credit);
                    }
                }
                // 明细行：以现金侧分录呈现
                for (const e of es) {
                    if (!cashIds.has(e.id))
                        continue;
                    const debit = (0, money_util_1.toCents)(e.debit);
                    const credit = (0, money_util_1.toCents)(e.credit);
                    if (debit === 0 && credit === 0)
                        continue;
                    detail.push({
                        voucherId: v.id,
                        period: v.period,
                        voucherDate: v.voucherDate,
                        word: v.word,
                        voucherNo: v.voucherNo,
                        summary: e.summary,
                        accountName: e.accountName,
                        direction: debit > 0 ? 'inflow' : 'outflow',
                        amount: (0, money_util_1.fromCents)(debit > 0 ? debit : credit),
                        category: null,
                    });
                }
                void direction;
            }
        }
        // 期初/期末现金余额（含所有现金与银行科目）
        const closingState = await this.booksService.getClosingBalancesByCategory(endPeriod, fiscalYear, includeUnapproved);
        const closing = this.cashBalance(closingState.balances, accounts);
        // 期初须与期末保持同一会计年度上下文，否则跨年期间会漏掉该年度期初余额
        const openingPeriod = (0, date_util_1.addPeriod)(startPeriod, -1);
        const openingState = await this.booksService.getClosingBalancesByCategory(openingPeriod, fiscalYear, includeUnapproved);
        const opening = this.cashBalance(openingState.balances, accounts);
        const list = Object.values(categories);
        const net = (c) => (0, money_util_1.fromCents)((0, money_util_1.toCents)(c.inflow) - (0, money_util_1.toCents)(c.outflow));
        const netIncrease = (0, money_util_1.fromCents)((0, money_util_1.toCents)(closing) - (0, money_util_1.toCents)(opening));
        // 分累加，避免反复 toCents 把已累加的「分」再放大 100 倍
        const sumNetCents = list.reduce((acc, c) => acc + (0, money_util_1.toCents)(net(c)), 0);
        const sumNet = (0, money_util_1.fromCents)(sumNetCents);
        return {
            title: '现金流量简表',
            period: { startPeriod, endPeriod },
            startDate: (0, date_util_1.periodStartDate)(startPeriod),
            endDate: (0, date_util_1.periodEndDate)(endPeriod),
            openingBalance: opening,
            closingBalance: closing,
            netIncrease,
            categories: list.map((c) => ({ ...c, net: net(c) })),
            balanced: (0, money_util_1.toCents)(sumNet) === (0, money_util_1.toCents)(netIncrease),
            difference: (0, money_util_1.fromCents)(Math.abs((0, money_util_1.toCents)(sumNet) - (0, money_util_1.toCents)(netIncrease))),
            detail,
        };
    }
    // ==================== P18.3 费用结构分析 ====================
    async expenseAnalysis(query) {
        const endPeriod = query.endPeriod ?? (0, date_util_1.currentPeriod)();
        const startPeriod = query.startPeriod ?? endPeriod;
        if (startPeriod > endPeriod) {
            return this.throwPeriodError();
        }
        const includeUnapproved = query.includeUnapproved ?? false;
        const accounts = await this.accountRepo.find();
        const levelOne = new Map();
        for (const a of accounts) {
            if (a.level === 1)
                levelOne.set(a.code, { code: a.code, name: a.name });
        }
        const voucherQb = this.voucherRepo
            .createQueryBuilder('v')
            .where('v.period >= :startPeriod AND v.period <= :endPeriod', { startPeriod, endPeriod });
        if (!includeUnapproved) {
            voucherQb.andWhere('v.status = :status', { status: enums_1.VoucherStatus.APPROVED });
        }
        else {
            voucherQb.andWhere('v.status IN (:...statuses)', {
                statuses: [enums_1.VoucherStatus.APPROVED, enums_1.VoucherStatus.DRAFT],
            });
        }
        const vouchers = await voucherQb.orderBy('v.voucherDate', 'ASC').addOrderBy('v.voucherNo', 'ASC').getMany();
        const voucherMap = new Map(vouchers.map((v) => [v.id, v]));
        const whereParts = EXPENSE_CODES.map((c) => `e.accountCode LIKE '${c}%'`).join(' OR ');
        const entries = vouchers.length
            ? await this.entryRepo
                .createQueryBuilder('e')
                .where(`e.voucherId IN (:...ids) AND (${whereParts})`, { ids: vouchers.map((v) => v.id) })
                .getMany()
            : [];
        const byAccount = new Map();
        const byPartner = new Map();
        let total = 0;
        const rows = [];
        for (const e of entries) {
            const voucher = voucherMap.get(e.voucherId);
            if (!voucher)
                continue;
            const amount = (0, money_util_1.fromCents)((0, money_util_1.toCents)(e.debit) - (0, money_util_1.toCents)(e.credit));
            if (amount <= 0)
                continue;
            total = (0, money_util_1.fromCents)((0, money_util_1.toCents)(total) + (0, money_util_1.toCents)(amount));
            const code = e.accountCode.slice(0, 4);
            const a = levelOne.get(code) ?? { code, name: e.accountName };
            const g = byAccount.get(code) ?? { code, name: a.name, amount: 0 };
            g.amount = (0, money_util_1.fromCents)((0, money_util_1.toCents)(g.amount) + (0, money_util_1.toCents)(amount));
            byAccount.set(code, g);
            const key = e.partnerId ?? '';
            const p = byPartner.get(key) ?? { partnerId: e.partnerId, partnerName: '', amount: 0 };
            p.amount = (0, money_util_1.fromCents)((0, money_util_1.toCents)(p.amount) + (0, money_util_1.toCents)(amount));
            byPartner.set(key, p);
            rows.push({
                voucherId: voucher.id,
                period: voucher.period,
                voucherDate: voucher.voucherDate,
                word: voucher.word,
                voucherNo: voucher.voucherNo,
                summary: e.summary,
                accountCode: e.accountCode,
                accountName: e.accountName,
                amount,
                partnerId: e.partnerId,
            });
        }
        // 交易对手名称
        const partnerIds = Array.from(byPartner.values())
            .map((p) => p.partnerId)
            .filter(Boolean);
        const partners = partnerIds.length
            ? await this.partnerRepo.find({ where: { id: (0, typeorm_1.In)(partnerIds) } })
            : [];
        const partnerNameMap = new Map(partners.map((p) => [p.id, p.name]));
        const percent = (v) => {
            if (total <= 0)
                return 0;
            return Math.round((v / total) * 10000) / 100;
        };
        return {
            title: '费用结构分析',
            period: { startPeriod, endPeriod },
            startDate: (0, date_util_1.periodStartDate)(startPeriod),
            endDate: (0, date_util_1.periodEndDate)(endPeriod),
            total,
            byAccount: Array.from(byAccount.values())
                .map((g) => ({ ...g, percent: percent(g.amount) }))
                .sort((a, b) => b.amount - a.amount),
            byPartner: Array.from(byPartner.values())
                .map((g) => ({
                ...g,
                partnerName: g.partnerId ? partnerNameMap.get(g.partnerId) ?? '未知往来单位' : '未指定',
                percent: percent(g.amount),
            }))
                .sort((a, b) => b.amount - a.amount),
            rows: rows.map((r) => ({
                ...r,
                partnerName: r.partnerId ? partnerNameMap.get(r.partnerId) ?? null : null,
            })),
        };
    }
    // ==================== P18.4 一键月结 ====================
    async monthlyClose(query) {
        const endPeriod = query.endPeriod ?? (0, date_util_1.currentPeriod)();
        const fiscalYear = query.fiscalYear ?? (0, date_util_1.periodToYear)(endPeriod);
        const [pendingReceipts, unapprovedVouchers, openPayrolls, unapprovedExpenseClaims] = await Promise.all([
            this.receiptRepo
                .createQueryBuilder('r')
                .where('r.status IN (:...statuses)', {
                statuses: [enums_1.ReceiptStatus.PARSED, enums_1.ReceiptStatus.DRAFTED],
            })
                .getCount(),
            this.voucherRepo.count({ where: { status: enums_1.VoucherStatus.DRAFT } }),
            this.payrollRepo
                .createQueryBuilder('p')
                .where("p.status != 'paid'")
                .getCount(),
            this.expenseClaimRepo.count({ where: { status: 'draft' } }),
        ]);
        const checks = {
            pendingReceipts,
            unapprovedVouchers,
            openPayrolls,
            unapprovedExpenseClaims,
        };
        const issues = [];
        // 固定费用：截至结账期间应生成而未生成的项（期间 202610 -> '2026-10'）
        const untilPeriod = `${Math.floor(endPeriod / 100)}-${String(endPeriod % 100).padStart(2, '0')}`;
        const fixedPending = await this.pendingFixedExpense(untilPeriod);
        checks.pendingFixedExpenses = fixedPending.count;
        checks.pendingFixedExpenseAmount = fixedPending.totalAmount;
        if (fixedPending.count > 0) {
            issues.push(`尚有 ${fixedPending.count} 期固定费用未生成（预计合计 ${fixedPending.totalAmount} 元，可在「固定费用」页一键生成）`);
        }
        if (pendingReceipts > 0) {
            issues.push(`尚有 ${pendingReceipts} 张票据未确认（待确认工作台）`);
        }
        if (unapprovedVouchers > 0) {
            issues.push(`尚有 ${unapprovedVouchers} 张凭证未审核`);
        }
        if (openPayrolls > 0) {
            issues.push(`尚有 ${openPayrolls} 张工资单未发放`);
        }
        if (unapprovedExpenseClaims > 0) {
            issues.push(`尚有 ${unapprovedExpenseClaims} 张报销单未审核`);
        }
        // 报表包：资产负债表 + 利润表 + 现金流量简表 + 票据台账汇总
        const [balanceSheet, profitLoss, cashFlow, receiptLedger] = await Promise.all([
            this.reportsService.balanceSheet({ endPeriod, fiscalYear }),
            this.reportsService.profitLoss({ endPeriod, startPeriod: endPeriod, fiscalYear }),
            this.cashFlow({ endPeriod, startPeriod: endPeriod, fiscalYear }),
            this.receiptLedger({ endPeriod, startPeriod: endPeriod, fiscalYear }),
        ]);
        return {
            title: '一键月结',
            period: endPeriod,
            endDate: (0, date_util_1.periodEndDate)(endPeriod),
            checks,
            issues,
            ready: issues.length === 0,
            report: {
                balanceSheet: {
                    totalAssets: balanceSheet.totals.totalAssets,
                    totalLiabilities: balanceSheet.totals.totalLiabilities,
                    totalEquity: balanceSheet.totals.totalEquity,
                    balanced: balanceSheet.balanced,
                },
                profitLoss: {
                    operatingRevenue: profitLoss.currentPeriod.totals.operatingRevenue,
                    operatingProfit: profitLoss.currentPeriod.totals.operatingProfit,
                    netProfit: profitLoss.currentPeriod.totals.netProfit,
                },
                cashFlow: {
                    openingBalance: cashFlow.openingBalance,
                    closingBalance: cashFlow.closingBalance,
                    netIncrease: cashFlow.netIncrease,
                    categories: cashFlow.categories,
                    balanced: cashFlow.balanced,
                },
                receiptSummary: {
                    count: receiptLedger.summary.count,
                    amount: receiptLedger.summary.amount,
                    taxAmount: receiptLedger.summary.taxAmount,
                    byType: receiptLedger.summary.byType,
                },
            },
        };
    }
    // ==================== P18.5 经营看板 ====================
    async overview(query) {
        const endPeriod = query.endPeriod ?? (0, date_util_1.currentPeriod)();
        const startPeriod = query.startPeriod ?? endPeriod;
        const fiscalYear = query.fiscalYear ?? (0, date_util_1.periodToYear)(endPeriod);
        const { balances, accounts } = await this.booksService.getClosingBalancesByCategory(endPeriod, fiscalYear, false);
        const byCode = new Map(accounts.map((a) => [a.code, a]));
        const netOf = (code) => {
            const account = byCode.get(code);
            if (!account)
                return 0;
            const set = balances.get(account.id);
            if (!set)
                return 0;
            // balances 内部金额单位是「分」
            const periodNet = set.periodDebit - set.periodCredit;
            return (0, money_util_1.fromCents)(account.direction === enums_1.BalanceDirection.DEBIT ? periodNet : -periodNet);
        };
        const closingOf = (code) => {
            const account = byCode.get(code);
            if (!account)
                return 0;
            const set = balances.get(account.id);
            if (!set)
                return 0;
            return (0, money_util_1.fromCents)(account.direction === enums_1.BalanceDirection.DEBIT
                ? set.closeDebit - set.closeCredit
                : set.closeCredit - set.closeDebit);
        };
        const income = (0, money_util_1.fromCents)((0, money_util_1.toCents)(netOf('6001')) + (0, money_util_1.toCents)(netOf('6051')));
        const expense = (0, money_util_1.fromCents)(EXPENSE_CODES.reduce((acc, code) => acc + (0, money_util_1.toCents)(netOf(code)), 0));
        // 税负：应交税费（2221）本期借方=实缴、贷方=计提（科目为 credit 方向）
        const taxAccount = byCode.get('2221');
        let taxPaidAmount = 0;
        let taxAccruedAmount = 0;
        if (taxAccount) {
            const set = balances.get(taxAccount.id);
            if (set) {
                taxPaidAmount = (0, money_util_1.fromCents)(Math.max(set.periodDebit - set.periodCredit, 0));
                taxAccruedAmount = (0, money_util_1.fromCents)(Math.max(set.periodCredit - set.periodDebit, 0));
            }
        }
        const [pendingReceipts, monthVoucherCount] = await Promise.all([
            this.receiptRepo
                .createQueryBuilder('r')
                .where('r.status IN (:...statuses)', {
                statuses: [enums_1.ReceiptStatus.PARSED, enums_1.ReceiptStatus.DRAFTED],
            })
                .getCount(),
            this.voucherRepo
                .createQueryBuilder('v')
                .where('v.period = :period', { period: endPeriod })
                .getCount(),
        ]);
        const cashBalance = (0, money_util_1.fromCents)(accounts
            .filter((a) => a.isCash || a.isBank)
            .reduce((acc, a) => {
            const set = balances.get(a.id);
            if (!set)
                return acc;
            return acc + (set.closeDebit - set.closeCredit);
        }, 0));
        return {
            period: endPeriod,
            month: {
                income,
                expense: (0, money_util_1.fromCents)(expense),
                netProfit: (0, money_util_1.fromCents)((0, money_util_1.toCents)(income) - (0, money_util_1.toCents)(expense)),
                taxPaid: taxPaidAmount,
                taxAccrued: taxAccruedAmount,
            },
            balance: {
                cash: cashBalance,
                receivable: closingOf('1122'),
                payable: closingOf('2202'),
            },
            pendingReceipts,
            monthVoucherCount,
        };
    }
    // ==================== 内部 ====================
    /**
     * 固定费用待生成汇总。
     *
     * 报表只读取固定费用数据，不依赖固定费用插件是否安装，避免内核报表模块
     * 与插件服务形成运行时依赖。
     */
    async pendingFixedExpense(untilPeriod) {
        const templates = await this.fixedExpenseRepo.find({ where: { status: 1 } });
        const logs = await this.fixedExpenseLogRepo.find();
        const done = new Set(logs.map((l) => `${l.templateId}:${l.period}`));
        let count = 0;
        let totalAmount = 0;
        for (const template of templates) {
            const periods = this.pendingPeriodsOf(template, untilPeriod).filter((p) => !done.has(`${template.id}:${p}`));
            count += periods.length;
            totalAmount += Number(template.amount) * periods.length;
        }
        return { count, totalAmount: Math.round(totalAmount * 100) / 100 };
    }
    pendingPeriodsOf(template, untilPeriod) {
        const start = String(template.startDate).slice(0, 7);
        const end = template.endDate ? String(template.endDate).slice(0, 7) : null;
        if (template.frequency === 'once') {
            const inRange = this.comparePeriod(start, untilPeriod) <= 0 &&
                (!end || this.comparePeriod(start, end) <= 0);
            return inRange ? [start] : [];
        }
        const periods = [];
        let cursor = start;
        for (let i = 0; i < 600 && this.comparePeriod(cursor, untilPeriod) <= 0; i++) {
            if (!end || this.comparePeriod(cursor, end) <= 0)
                periods.push(cursor);
            cursor = this.addPeriod(cursor, this.frequencyStep(template.frequency));
        }
        return periods;
    }
    frequencyStep(frequency) {
        if (frequency === 'quarterly')
            return 3;
        if (frequency === 'yearly')
            return 12;
        return 1;
    }
    addPeriod(period, n) {
        const [y, m] = period.split('-').map(Number);
        const total = y * 12 + (m - 1) + n;
        return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
    }
    comparePeriod(a, b) {
        return a === b ? 0 : a < b ? -1 : 1;
    }
    cashBalance(balances, accounts) {
        // balances 为 computeBalances 原样返回，内部金额单位是「分」
        return (0, money_util_1.fromCents)(accounts
            .filter((a) => a.isCash || a.isBank)
            .reduce((acc, a) => {
            const set = balances.get(a.id);
            if (!set)
                return acc;
            return acc + (set.closeDebit - set.closeCredit);
        }, 0));
    }
    receiptStatusLabel(status) {
        const map = {
            parsed: '已解析',
            drafted: '草稿',
            confirmed: '已确认',
            rejected: '已驳回',
            duplicate: '重复',
            failed: '失败',
        };
        return map[status] ?? status;
    }
    throwPeriodError() {
        throw new common_1.BadRequestException('起始期间不能大于结束期间');
    }
};
exports.AnalysisService = AnalysisService;
exports.AnalysisService = AnalysisService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, company_repo_decorator_1.InjectCompanyRepo)(account_entity_1.Account)),
    __param(1, (0, company_repo_decorator_1.InjectCompanyRepo)(voucher_entity_1.Voucher)),
    __param(2, (0, company_repo_decorator_1.InjectCompanyRepo)(voucher_entry_entity_1.VoucherEntry)),
    __param(3, (0, company_repo_decorator_1.InjectCompanyRepo)(receipt_entity_1.Receipt)),
    __param(4, (0, company_repo_decorator_1.InjectCompanyRepo)(partner_entity_1.Partner)),
    __param(5, (0, company_repo_decorator_1.InjectCompanyRepo)(hr_entity_1.Payroll)),
    __param(6, (0, company_repo_decorator_1.InjectCompanyRepo)(hr_entity_1.ExpenseClaim)),
    __param(7, (0, company_repo_decorator_1.InjectCompanyRepo)(fixed_expense_entity_1.FixedExpense)),
    __param(8, (0, company_repo_decorator_1.InjectCompanyRepo)(fixed_expense_entity_1.FixedExpenseLog)),
    __metadata("design:paramtypes", [company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        books_service_1.BooksService,
        reports_service_1.ReportsService])
], AnalysisService);
