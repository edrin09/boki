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
exports.VoiceQueryService = void 0;
const common_1 = require("@nestjs/common");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
const voucher_entity_1 = require("@core/entities/voucher.entity");
const bank_account_entity_1 = require("@core/entities/bank-account.entity");
const account_entity_1 = require("@core/entities/account.entity");
const hr_entity_1 = require("@core/entities/hr.entity");
const enums_1 = require("@core/common/enums");
const date_util_1 = require("@core/common/utils/date.util");
const money_util_1 = require("@core/common/utils/money.util");
const reports_service_1 = require("@plugin/report-pack/server/modules/reports/reports.service");
const analysis_service_1 = require("@plugin/report-pack/server/modules/reports/analysis.service");
const books_service_1 = require("@core/modules/books/books.service");
const excel_builder_1 = require("./excel/excel-builder");
const export_store_1 = require("./excel/export-store");
const ai_service_1 = require("@plugin/ai/server/modules/ai/ai.service");
const ai_agent_service_1 = require("./ai-agent.service");
const intent_registry_1 = require("./nlu/intent-registry");
const time_parser_1 = require("./nlu/time-parser");
/** 无匹配意图时的话术：顺手把可用指令告诉用户（兜底） */
const FALLBACK_OPTIONS = [
    '收支/盈亏（本月、十月、今年、去年）',
    '盈亏预测（预测/预估下月情况）',
    '应收/应付（谁欠我、我欠谁）',
    '员工借款',
    '资金余额',
    '费用（花在哪）',
    '凭证统计',
    '导出凭证/报销/借款单',
];
/**
 * 识别 → 意图 → 查询 → Excel → 话术 流水线。
 *
 * 音频在 VoiceAsrService 中转成文字后也进入本服务，
 * 保证「敢欠的语音」与文字输入走同一套意图与数据口径。
 */
let VoiceQueryService = class VoiceQueryService {
    reportsService;
    analysisService;
    booksService;
    loanRepo;
    claimRepo;
    voucherRepo;
    bankRepo;
    accountRepo;
    ai;
    agent;
    logger = new common_1.Logger('VoiceQuery');
    constructor(reportsService, analysisService, booksService, loanRepo, claimRepo, voucherRepo, bankRepo, accountRepo, ai, agent) {
        this.reportsService = reportsService;
        this.analysisService = analysisService;
        this.booksService = booksService;
        this.loanRepo = loanRepo;
        this.claimRepo = claimRepo;
        this.voucherRepo = voucherRepo;
        this.bankRepo = bankRepo;
        this.accountRepo = accountRepo;
        this.ai = ai;
        this.agent = agent;
    }
    /**
     * 文字入口（Plan B 通道 + 回测入口）：直接用文本走完整流水线。
     * ASR 可用与不可用时的行为一致。
     */
    async runText(transcript) {
        const text = (transcript ?? '').trim();
        if (!text)
            throw new common_1.BadRequestException('请先说话或在输入框输入指令');
        // 查询路由：
        // 1) 导出类是固定工作流（Excel 下载），关键词命中即执行，保证稳定；
        // 2) 其余问题在已接 AI 时一律优先走智能体 —— 模型自主理解意图、选工具查库回答，
        //    新问法/新需求无需改代码；智能体不可用（未接 AI / 失败 / 超时）时回落固定意图；
        // 3) 都不行再给兜底话术。
        const kwMatched = this.matchIntent(text);
        if (!kwMatched || !kwMatched.intent.id.startsWith('export.')) {
            const agentRes = await this.agent.run(text, this.svc()).catch(() => null);
            if (agentRes)
                return agentRes;
        }
        const matched = kwMatched;
        if (!matched) {
            return {
                transcript: text,
                intentId: 'fallback',
                intentTitle: '未识别',
                reply: `没有听明白。我可以帮你查：${FALLBACK_OPTIONS.join('、')}。比如“看看这个月的收支”“张三还有哪笔借款没还”。`,
                card: { title: '未识别指令', columns: [], rows: [] },
            };
        }
        const { intent, range } = matched;
        let exec;
        try {
            exec = await intent.execute(this.svc(), range);
        }
        catch (err) {
            // 数据侧原因（如科目未建）不应让用户面对 500，转为友好话术
            this.logger.warn(`意图 ${intent.id} 执行失败: ${err.message}`);
            return {
                transcript: text,
                intentId: intent.id,
                intentTitle: intent.title,
                reply: `查询「${intent.title}」时出了点问题：${err.message}。可以先检查相关基础资料是否完整。`,
                card: { title: intent.title, columns: [], rows: [] },
            };
        }
        if (!exec || !exec.card.rows.length) {
            return {
                transcript: text,
                intentId: intent.id,
                intentTitle: intent.title,
                reply: this.fill(intent.emptyReply, { label: range.label }),
                card: { title: intent.title, columns: [], rows: [] },
            };
        }
        // 生成 Excel：与卡片共用同一套列定义和数字，保证语音总结 = 表格 = Excel
        const buffer = (0, excel_builder_1.buildWorkbook)(exec.card.title, exec.card.columns, exec.card.rows, exec.card.totals ?? null);
        const stamp = this.stamp();
        const saved = (0, export_store_1.saveExport)(buffer, `${exec.card.title}_${stamp}.xlsx`);
        // 话术：模板先行保证数字准确；已接 AI 时再用模型润色得更自然（禁止改数字）
        const templateReply = this.fill(intent.replyTpl, exec.vars);
        const reply = await this.polishReply(text, intent.title, templateReply);
        return {
            transcript: text,
            intentId: intent.id,
            intentTitle: intent.title,
            reply,
            card: exec.card,
            exportId: saved.exportId,
        };
    }
    /** 导出缓存读取；重启/过期返回 null，前端提示重新提问 */
    downloadExport(exportId) {
        return (0, export_store_1.getExport)(exportId);
    }
    /**
     * 意图匹配：关键词命中第一个意图即返回；fullYearOnly 意图要求
     * 解析期间为整年，避免「今年十月应收」被「今年」抢先。
     *
     * 关键词匹配同时支持：
     * - 复合词「A+B」：剥离时间词后需同时包含 A 与 B（如「导出这个月的凭证」）
     * - 时间词剥离：时间词本身不参与意图判断，避免「导出10月凭证」落在普通意图
     */
    matchIntent(text) {
        const now = (0, date_util_1.currentPeriod)();
        const parsed = (0, time_parser_1.parseChineseTime)(text);
        const range = {
            startPeriod: parsed?.startPeriod ?? now,
            endPeriod: parsed?.endPeriod ?? now,
            label: parsed?.label ?? `${(0, date_util_1.periodToYear)(now)}年${now % 100}月`,
            fiscalYear: (0, date_util_1.periodToYear)(parsed?.endPeriod ?? now),
        };
        const stripped = stripTimeTokens(text);
        const hit = (intent) => intent.keywords.some((k) => {
            if (k.includes('+')) {
                return k.split('+').every((part) => stripped.includes(part) || text.includes(part));
            }
            return text.includes(k) || stripped.includes(k);
        });
        for (const intent of intent_registry_1.INTENTS) {
            if (!hit(intent))
                continue;
            if (intent.fullYearOnly && !(range.startPeriod % 100 === 1 && range.endPeriod % 100 === 12)) {
                continue;
            }
            return { intent, range };
        }
        return null;
    }
    /**
     * 话术润色：把固定模板话术改写得更自然（语音播报用）。
     * 铁律：数字一律原样保留，禁止增删改任何数字；失败/未接入 → 原样返回模板话术。
     */
    async polishReply(question, intentTitle, templateReply) {
        if (!(await this.ai.isReady()))
            return templateReply;
        try {
            const polished = await this.ai.chat([
                {
                    role: 'system',
                    content: '你是财务语音助手的播报编辑。把给定文案改写得更口语、更自然，适合语音播报。铁律：文案中的所有数字必须原样保留，不得新增、删除或改写任何数字；不得编造清单外信息；只输出改写后的文案，不要解释。',
                },
                {
                    role: 'user',
                    content: `用户问题：${question}\n查询主题：${intentTitle}\n文案：${templateReply}`,
                },
            ], { temperature: 0.3, maxTokens: 768, timeoutMs: 120000 });
            return polished;
        }
        catch (err) {
            this.logger.warn(`AI 话术润色失败，使用模板话术: ${err.message}`);
            return templateReply;
        }
    }
    svc() {
        return {
            reportsService: this.reportsService,
            analysisService: this.analysisService,
            booksService: this.booksService,
            arApService: {
                receivable: (query) => this.arApBalance(query, '1122', '应收'),
                payable: (query) => this.arApBalance(query, '2202', '应付'),
            },
            loansService: {
                findAll: (query) => this.loanRows(query),
            },
            settlementService: {
                employeeBalances: (query) => this.employeeLoanBalances(query),
            },
            expenseClaimsService: {
                findAll: (query) => this.claimRows(query),
            },
            voucherRepo: {
                countAll: (range) => this.voucherStats(range.startPeriod, range.endPeriod),
                list: (range, limit) => this.voucherRows(range.startPeriod, range.endPeriod, limit),
            },
            bankRepo: {
                list: async () => {
                    const now = (0, date_util_1.currentPeriod)();
                    return this.cashRows(now, (0, date_util_1.periodToYear)(now));
                },
            },
        };
    }
    /**
     * 借款单列表（只读）。
     *
     * 语音助手不依赖 hr 插件，直接查询内核 Loan 实体，
     * 未还金额 = 借款金额 - 已还 - 已核销。
     */
    async loanRows(query) {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        const qb = this.loanRepo.createQueryBuilder('l');
        if (query.startDate)
            qb.andWhere('l.loanDate >= :s', { s: query.startDate });
        if (query.endDate)
            qb.andWhere('l.loanDate <= :e', { e: query.endDate });
        const list = await qb
            .orderBy('l.loanDate', 'DESC')
            .addOrderBy('l.createdAt', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize)
            .getMany();
        return {
            list: list.map((l) => ({
                loanNo: l.loanNo,
                loanDate: l.loanDate,
                employeeName: l.employeeName,
                amount: Number(l.amount ?? 0),
                outstanding: this.outstandingOf(l),
                statusLabel: loanStatusLabel(l.status),
            })),
        };
    }
    /** 员工未还借款汇总（只读，口径与借款管理页一致） */
    async employeeLoanBalances(query) {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        const loans = await this.loanRepo
            .createQueryBuilder('l')
            .where('l.status IN (:...statuses)', {
            statuses: [enums_1.LoanStatus.APPROVED, enums_1.LoanStatus.REPAID],
        })
            .orderBy('l.loanDate', 'DESC')
            .getMany();
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
            row.balance =
                Math.round((row.loanTotal - row.repaidTotal - row.offsetTotal) * 100) / 100;
        }
        const all = Array.from(map.values()).sort((a, b) => b.balance - a.balance);
        const start = (page - 1) * pageSize;
        return { list: all.slice(start, start + pageSize) };
    }
    /** 报销单列表（只读），供语音导出 Excel */
    async claimRows(query) {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        const qb = this.claimRepo.createQueryBuilder('c');
        if (query.startDate)
            qb.andWhere('c.claimDate >= :s', { s: query.startDate });
        if (query.endDate)
            qb.andWhere('c.claimDate <= :e', { e: query.endDate });
        const list = await qb
            .orderBy('c.claimDate', 'DESC')
            .addOrderBy('c.createdAt', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize)
            .getMany();
        return {
            list: list.map((c) => ({
                claimNo: c.claimNo,
                claimDate: c.claimDate,
                employeeName: c.employeeName,
                totalAmount: c.totalAmount,
                statusLabel: claimStatusLabel(c.status),
            })),
        };
    }
    outstandingOf(loan) {
        return (0, money_util_1.fromCents)((0, money_util_1.toCents)(Number(loan.amount ?? 0)) -
            (0, money_util_1.toCents)(Number(loan.repaidAmount ?? 0)) -
            (0, money_util_1.toCents)(Number(loan.offsetAmount ?? 0)));
    }
    /**
     * 应收/应付余额汇总。
     *
     * 语音助手只做聚合查询，不依赖 ar-ap 插件是否安装，直接复用账簿的
     * 往来辅助核算口径，避免内核与插件之间形成运行时依赖。
     */
    async arApBalance(query, code, label) {
        const account = await this.accountRepo.findOne({ where: { code } });
        if (!account) {
            throw new common_1.NotFoundException(`科目「${code}」不存在，无法查询${label}余额`);
        }
        const result = await this.booksService.subLedger({
            accountId: account.id,
            endPeriod: query.endPeriod,
            fiscalYear: query.fiscalYear,
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
    /** 模板填充：数字统一千分位两位小数 */
    fill(tpl, vars) {
        return (tpl || '').replace(/\{(\w+)\}/g, (_, key) => {
            const v = vars?.[key];
            if (typeof v === 'number')
                return formatMoney(v);
            if (v == null)
                return '';
            return String(v);
        });
    }
    /** 凭证期间统计：张数与借贷合计（仅已审核，与报表口径一致） */
    async voucherStats(startPeriod, endPeriod) {
        const raw = await this.voucherRepo
            .createQueryBuilder('v')
            .select('COUNT(1)', 'count')
            .addSelect('COALESCE(SUM(v.debitTotal), 0)', 'debit')
            .addSelect('COALESCE(SUM(v.creditTotal), 0)', 'credit')
            .where('v.period >= :s AND v.period <= :e', { s: startPeriod, e: endPeriod })
            .andWhere('v.status = :st', { st: enums_1.VoucherStatus.APPROVED })
            .getRawOne();
        return {
            count: Number(raw?.count ?? 0),
            debit: (0, money_util_1.toCents)(Number(raw?.debit ?? 0)) / 100,
            credit: (0, money_util_1.toCents)(Number(raw?.credit ?? 0)) / 100,
        };
    }
    /** 凭证明细（按上限截断），供导出 Excel */
    async voucherRows(startPeriod, endPeriod, limit) {
        const vouchers = await this.voucherRepo
            .createQueryBuilder('v')
            .where('v.period >= :s AND v.period <= :e', { s: startPeriod, e: endPeriod })
            .orderBy('v.voucherDate', 'ASC')
            .addOrderBy('v.voucherNo', 'ASC')
            .take(limit)
            .getMany();
        return vouchers.map((v) => ({
            voucherNo: `${v.word}-${v.voucherNo}`,
            voucherDate: v.voucherDate,
            summary: v.remark ?? '',
            debitTotal: Number(v.debitTotal ?? 0),
            creditTotal: Number(v.creditTotal ?? 0),
        }));
    }
    /** 资金账户余额行：启用账户 × 其对应会计科目的期末余额（资产 借-贷） */
    async cashRows(endPeriod, fiscalYear) {
        const banks = (await this.bankRepo.find({ order: { code: 'ASC' } })).filter((b) => b.status === 1);
        const balances = await this.booksService.computeBalances({ endPeriod, fiscalYear });
        const rows = banks.map((b) => {
            let amount = 0;
            if (b.accountCode) {
                // 账户可能对应明细科目（如 1002.01），余额会向上汇总到父科目；
                // 按编码精确匹配功能科目，取不到就取编码前缀最长的一条
                const accounts = balances.accounts;
                const exact = accounts.find((a) => a.code === b.accountCode);
                const prefix = accounts
                    .filter((a) => b.accountCode.startsWith(a.code))
                    .sort((x, y) => y.code.length - x.code.length)[0];
                const target = exact ?? prefix;
                const amt = target
                    ? balances.balances.get(target.id)
                    : undefined;
                // computeBalances 返回的 Map 里金额单位是「分」，直接 fromCents 转元；
                // 不能再过一次 toCents（等于 ×100，会把 -1.6万 算成 -160万）
                if (amt)
                    amount = (0, money_util_1.fromCents)(amt.closeDebit - amt.closeCredit);
            }
            return { name: b.name, typeLabel: b.type === 'cash' ? '现金' : '银行', amount };
        });
        return rows;
    }
    stamp() {
        const d = new Date();
        return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    }
};
exports.VoiceQueryService = VoiceQueryService;
exports.VoiceQueryService = VoiceQueryService = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, company_repo_decorator_1.InjectCompanyRepo)(hr_entity_1.Loan)),
    __param(4, (0, company_repo_decorator_1.InjectCompanyRepo)(hr_entity_1.ExpenseClaim)),
    __param(5, (0, company_repo_decorator_1.InjectCompanyRepo)(voucher_entity_1.Voucher)),
    __param(6, (0, company_repo_decorator_1.InjectCompanyRepo)(bank_account_entity_1.BankAccount)),
    __param(7, (0, company_repo_decorator_1.InjectCompanyRepo)(account_entity_1.Account)),
    __metadata("design:paramtypes", [reports_service_1.ReportsService,
        analysis_service_1.AnalysisService,
        books_service_1.BooksService, Function, Function, Function, Function, Function, ai_service_1.AiService,
        ai_agent_service_1.AiAgentService])
], VoiceQueryService);
function formatMoney(v) {
    return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function loanStatusLabel(status) {
    switch (status) {
        case enums_1.LoanStatus.DRAFT:
            return '草稿';
        case enums_1.LoanStatus.APPROVED:
            return '已借款';
        case enums_1.LoanStatus.REPAID:
            return '已还款';
        case enums_1.LoanStatus.REJECTED:
            return '已驳回';
        default:
            return status;
    }
}
function claimStatusLabel(status) {
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
/** 时间词剥离：「导出这个月的凭证」→「导出的凭证」；导出/统计类意图建议用复合关键词 */
const TIME_TOKENS = [
    /\d{4}年\d{1,2}月/g,
    /\d{1,2}月/g,
    /[十十一二两三四五六七八九\d]+月/g,
    /(今年|本年|去年|上一年|全年|年度|本月|这个月|上个月|当月|上月|这一个月)/g,
];
function stripTimeTokens(text) {
    let out = text;
    for (const re of TIME_TOKENS)
        out = out.replace(re, '');
    return out;
}
