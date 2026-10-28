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
exports.ReportsService = void 0;
const common_1 = require("@nestjs/common");
const account_entity_1 = require("@core/entities/account.entity");
const company_repository_1 = require("@core/common/company/company.repository");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
const enums_1 = require("@core/common/enums");
const money_util_1 = require("@core/common/utils/money.util");
const date_util_1 = require("@core/common/utils/date.util");
const books_service_1 = require("@core/modules/books/books.service");
/** 利润表结构（按科目编码定义，缺科目自动按 0 处理） */
const PL_STRUCTURE = [
    { key: 'revenue', title: '一、营业收入', codes: ['6001', '6051'] },
    { key: 'operatingCost', title: '减：营业成本', minus: true, codes: ['6401'] },
    { key: 'taxAndSurcharge', title: '减：税金及附加', minus: true, codes: ['6301'] },
    { key: 'sellingExpense', title: '减：销售费用', minus: true, codes: ['6601'] },
    { key: 'adminExpense', title: '减：管理费用', minus: true, codes: ['6602'] },
    { key: 'rdExpense', title: '减：研发费用', minus: true, codes: ['6603'] },
    { key: 'financialExpense', title: '减：财务费用', minus: true, codes: ['6701'] },
    { key: 'investmentIncome', title: '加：投资收益', plus: true, codes: ['6111'] },
    { key: 'nonOperatingIncome', title: '加：营业外收入', plus: true, codes: ['6201'] },
    { key: 'nonOperatingExpense', title: '减：营业外支出', minus: true, codes: ['6801'] },
    { key: 'incomeTax', title: '减：所得税费用', minus: true, codes: ['6901'] },
];
let ReportsService = class ReportsService {
    accountRepo;
    booksService;
    constructor(accountRepo, booksService) {
        this.accountRepo = accountRepo;
        this.booksService = booksService;
    }
    // ==================== 资产负债表 ====================
    /**
     * 资产负债表（时点表）
     */
    async balanceSheet(query) {
        const endPeriod = query.endPeriod ?? (0, date_util_1.currentPeriod)();
        const fiscalYear = query.fiscalYear ?? (0, date_util_1.periodToYear)(endPeriod);
        const includeUnapproved = query.includeUnapproved ?? false;
        const { balances, accounts } = await this.booksService.getClosingBalancesByCategory(endPeriod, fiscalYear, includeUnapproved);
        /** 科目按余额方向符号化后的期末净额（分） */
        const signedClosing = (account) => {
            const set = balances.get(account.id);
            if (!set)
                return 0;
            return account.direction === enums_1.BalanceDirection.DEBIT
                ? set.closeDebit - set.closeCredit
                : set.closeCredit - set.closeDebit;
        };
        /** 报表行：一级 + 二级，过滤零金额的二级科目 */
        const buildLines = (category) => accounts
            .filter((a) => a.category === category && a.level <= 2)
            .map((a) => ({ account: a, cents: signedClosing(a) }))
            .filter(({ account, cents }) => cents !== 0 || account.level === 1)
            .map(({ account, cents }) => ({
            code: account.code,
            name: account.name,
            level: account.level,
            accountId: account.id,
            amount: (0, money_util_1.fromCents)(cents),
        }));
        /** 合计只统计一级科目，避免父子重复 */
        const totalOf = (category) => {
            let sum = 0;
            for (const a of accounts) {
                if (a.level === 1 && a.category === category) {
                    sum += signedClosing(a);
                }
            }
            return (0, money_util_1.fromCents)(sum);
        };
        const assets = buildLines('asset');
        const liabilities = buildLines('liability');
        const equity = buildLines('equity');
        const totalAssets = totalOf('asset');
        const totalLiabilities = totalOf('liability');
        const totalEquity = totalOf('equity');
        const totalLiabilityEquity = (0, money_util_1.fromCents)((0, money_util_1.toCents)(totalLiabilities) + (0, money_util_1.toCents)(totalEquity));
        const difference = (0, money_util_1.fromCents)(Math.abs((0, money_util_1.toCents)(totalAssets) - (0, money_util_1.toCents)(totalLiabilityEquity)));
        return {
            title: '资产负债表',
            unit: '元',
            period: endPeriod,
            date: (0, date_util_1.periodEndDate)(endPeriod),
            sections: [
                { key: 'asset', title: '资产', lines: assets, total: totalAssets },
                { key: 'liability', title: '负债', lines: liabilities, total: totalLiabilities },
                { key: 'equity', title: '所有者权益', lines: equity, total: totalEquity },
            ],
            totals: {
                totalAssets,
                totalLiabilities,
                totalEquity,
                totalLiabilityEquity,
            },
            balanced: (0, money_util_1.toCents)(difference) === 0,
            difference,
            note: '说明：未做期末结转损益时，损益类科目余额会影响资产与负债及所有者权益的平衡差额；结转损益后将自动平衡。',
        };
    }
    // ==================== 利润表 ====================
    /**
     * 利润表（期间报表，含本期与本年累计）
     */
    async profitLoss(query) {
        const endPeriod = query.endPeriod ?? (0, date_util_1.currentPeriod)();
        const startPeriod = query.startPeriod ?? endPeriod;
        const fiscalYear = query.fiscalYear ?? (0, date_util_1.periodToYear)(endPeriod);
        const includeUnapproved = query.includeUnapproved ?? false;
        const accounts = await this.accountRepo.find({ order: { code: 'ASC' } });
        const accountByCode = new Map(accounts.map((a) => [a.code, a]));
        /** 本年累计发生额净额（按科目余额方向符号化） */
        const ytdAmounts = await this.booksService.getYearToDateAmounts(endPeriod, fiscalYear, includeUnapproved);
        const ytdOf = (code) => {
            const account = accountByCode.get(code);
            if (!account)
                return 0;
            const agg = ytdAmounts.get(account.id);
            if (!agg)
                return 0;
            return (0, money_util_1.fromCents)(account.direction === enums_1.BalanceDirection.CREDIT
                ? (0, money_util_1.toCents)(agg.credit) - (0, money_util_1.toCents)(agg.debit)
                : (0, money_util_1.toCents)(agg.debit) - (0, money_util_1.toCents)(agg.credit));
        };
        /** 本期发生额净额 */
        const currentOf = await this.currentPeriodAmounts(startPeriod, endPeriod, accounts, includeUnapproved);
        const buildSections = (lookup) => PL_STRUCTURE.map((s) => {
            const lines = s.codes
                .map((code) => {
                const account = accountByCode.get(code);
                return {
                    code,
                    name: account?.name ?? code,
                    level: 1,
                    accountId: account?.id ?? '',
                    amount: lookup(code),
                };
            })
                .filter((l) => l.amount !== 0 || s.codes.length === 1);
            return {
                key: s.key,
                title: s.title,
                minus: s.minus,
                plus: s.plus,
                lines,
                subtotal: (0, money_util_1.fromCents)(lines.reduce((acc, l) => acc + (0, money_util_1.toCents)(l.amount), 0)),
            };
        });
        const totalsOf = (lookup) => {
            const g = (code) => lookup(code) ?? 0;
            const operatingRevenue = g('6001') + g('6051');
            const operatingCost = g('6401');
            const taxAndSurcharge = g('6301');
            const sellingExpense = g('6601');
            const adminExpense = g('6602');
            const rdExpense = g('6603');
            const financialExpense = g('6701');
            const investmentIncome = g('6111');
            const nonOperatingIncome = g('6201');
            const nonOperatingExpense = g('6801');
            const incomeTax = g('6901');
            const operatingProfit = (0, money_util_1.fromCents)((0, money_util_1.toCents)(operatingRevenue) +
                (0, money_util_1.toCents)(investmentIncome) -
                (0, money_util_1.toCents)(operatingCost) -
                (0, money_util_1.toCents)(taxAndSurcharge) -
                (0, money_util_1.toCents)(sellingExpense) -
                (0, money_util_1.toCents)(adminExpense) -
                (0, money_util_1.toCents)(rdExpense) -
                (0, money_util_1.toCents)(financialExpense));
            const totalProfit = (0, money_util_1.fromCents)((0, money_util_1.toCents)(operatingProfit) + (0, money_util_1.toCents)(nonOperatingIncome) - (0, money_util_1.toCents)(nonOperatingExpense));
            const netProfit = (0, money_util_1.fromCents)((0, money_util_1.toCents)(totalProfit) - (0, money_util_1.toCents)(incomeTax));
            return {
                operatingRevenue,
                operatingCost,
                taxAndSurcharge,
                sellingExpense,
                adminExpense,
                rdExpense,
                financialExpense,
                investmentIncome,
                operatingProfit,
                nonOperatingIncome,
                nonOperatingExpense,
                totalProfit,
                incomeTax,
                netProfit,
            };
        };
        return {
            title: '利润表',
            unit: '元',
            period: { startPeriod, endPeriod, fiscalYear },
            startDate: (0, date_util_1.periodStartDate)(startPeriod),
            endDate: (0, date_util_1.periodEndDate)(endPeriod),
            sections: buildSections(ytdOf),
            yearToDate: { totals: totalsOf(ytdOf) },
            currentPeriod: { totals: totalsOf(currentOf) },
        };
    }
    // ==================== 内部 ====================
    /**
     * 计算期间内各一级科目的发生额净额。
     * 做法：期末余额 - 期初余额（期初为起始期间上一期末）。
     * 若起始期间为 1 月，则本期即本年累计。
     */
    async currentPeriodAmounts(startPeriod, endPeriod, accounts, includeUnapproved) {
        const startIsJanuary = startPeriod % 100 === 1;
        const endState = await this.booksService.getClosingBalancesByCategory(endPeriod, (0, date_util_1.periodToYear)(endPeriod), includeUnapproved);
        if (startIsJanuary) {
            // 本期从 1 月开始，期初为年度期初，取期初余额为 0 即可
            const startState = await this.booksService.getClosingBalancesByCategory(startPeriod, (0, date_util_1.periodToYear)(startPeriod), includeUnapproved);
            return (code) => this.diffByCode(accounts, endState.balances, startState.balances, code);
        }
        const beforeStart = this.previousPeriod(startPeriod);
        const startState = await this.booksService.getClosingBalancesByCategory(beforeStart, (0, date_util_1.periodToYear)(beforeStart), includeUnapproved);
        return (code) => this.diffByCode(accounts, endState.balances, startState.balances, code);
    }
    /** 指定科目编码在两期之间的余额变动（按方向符号化） */
    diffByCode(accounts, endBalances, startBalances, code) {
        const account = accounts.find((a) => a.code === code);
        if (!account)
            return 0;
        const sign = account.direction === enums_1.BalanceDirection.DEBIT ? 1 : -1;
        const endSet = endBalances.get(account.id);
        const startSet = startBalances.get(account.id);
        if (!endSet)
            return 0;
        const endSigned = sign * (endSet.closeDebit - endSet.closeCredit);
        const startSigned = startSet ? sign * (startSet.closeDebit - startSet.closeCredit) : 0;
        return (0, money_util_1.fromCents)(endSigned - startSigned);
    }
    previousPeriod(period) {
        const year = Math.floor(period / 100);
        const month = period % 100;
        return month === 1 ? (year - 1) * 100 + 12 : period - 1;
    }
};
exports.ReportsService = ReportsService;
exports.ReportsService = ReportsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, company_repo_decorator_1.InjectCompanyRepo)(account_entity_1.Account)),
    __metadata("design:paramtypes", [company_repository_1.CompanyScopedRepository,
        books_service_1.BooksService])
], ReportsService);
