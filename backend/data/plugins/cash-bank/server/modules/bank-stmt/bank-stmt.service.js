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
exports.BankStmtService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const business_entity_1 = require("@core/entities/business.entity");
const account_entity_1 = require("@core/entities/account.entity");
const bank_account_entity_1 = require("@core/entities/bank-account.entity");
const hr_entity_1 = require("@core/entities/hr.entity");
const partner_entity_1 = require("@core/entities/partner.entity");
const company_repository_1 = require("@core/common/company/company.repository");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
const cash_bank_service_1 = require("../cash-bank/cash-bank.service");
const stmt_parser_1 = require("./stmt-parser");
/** 常用科目编码 */
const CODE = {
    INTEREST_INCOME: '6701.02', // 财务费用-利息收入
    BANK_FEE: '6701.03', // 财务费用-手续费
    RECEIVABLE: '1122', // 应收账款
    EMPLOYEE_RECEIVABLE: '1221', // 其他应收款（员工往来）
    OTHER_PAYABLE: '2241', // 其他应付款（收入行默认建议：暂挂往来，确认性质后再调）
    ADMIN_EXPENSE: '6602', // 管理费用（支出行默认建议）
};
const INTEREST_RE = /利息|结息/;
const FEE_RE = /手续费|工本费|年费|汇费|短信费|网银|服务费|账户费/;
/**
 * 常见摘要关键词 → 建议科目（支出方向）。
 * 工资/社保/公积金/税费/房租/贷款利息是公司银行流水的固定模式，
 * 命中即给高置信建议（可一键智能批量入账）；科目不存在时跳过该规则。
 */
const KEYWORD_RULES = [
    { re: /代发|工资|薪资|薪酬/, code: '2211.01', label: '识别为工资发放，建议冲应付职工薪酬-工资' },
    { re: /社保|社会保险/, code: '2211.02', label: '识别为社保缴费，建议冲应付职工薪酬-社会保险费' },
    { re: /公积金/, code: '2211.03', label: '识别为公积金缴费，建议冲应付职工薪酬-住房公积金' },
    { re: /税款|税费|税务|国税|地税|所得税|增值税/, code: '2221', label: '识别为税费缴纳，建议冲应交税费' },
    { re: /房租|租赁费|租金/, code: '6602', label: '识别为房租支出，建议计入管理费用' },
    { re: /贷款利息|借款利息|利息支出/, code: '6701.01', label: '识别为贷款利息，建议计入财务费用-利息支出' },
];
let BankStmtService = class BankStmtService {
    repo;
    accountRepo;
    bankRepo;
    partnerRepo;
    loanRepo;
    employeeRepo;
    cashBankService;
    constructor(repo, accountRepo, bankRepo, partnerRepo, loanRepo, employeeRepo, cashBankService) {
        this.repo = repo;
        this.accountRepo = accountRepo;
        this.bankRepo = bankRepo;
        this.partnerRepo = partnerRepo;
        this.loanRepo = loanRepo;
        this.employeeRepo = employeeRepo;
        this.cashBankService = cashBankService;
    }
    // ==================== 导入 ====================
    /** 解析对账单文件并落库，逐行自动匹配 */
    async import(file, bankAccountId, operator) {
        const bank = await this.bankRepo.findOne({ where: { id: bankAccountId } });
        if (!bank)
            throw new common_1.BadRequestException('资金账户不存在');
        const rows = (0, stmt_parser_1.parseStatement)(file.buffer, file.originalName);
        if (!rows.length)
            throw new common_1.BadRequestException('未解析出有效流水行，请确认文件内容');
        const batchId = (0, crypto_1.randomUUID)().slice(0, 8) + Date.now().toString(36);
        const ctx = await this.loadMatchContext();
        const entities = rows.map((r) => this.buildRow(r, batchId, bank.id, ctx));
        const saved = await this.repo.save(entities);
        const count = (s) => saved.filter((r) => r.status === s).length;
        return {
            batchId,
            total: saved.length,
            booked: count(business_entity_1.BankStmtStatus.BOOKED),
            matched: count(business_entity_1.BankStmtStatus.MATCHED),
            pending: count(business_entity_1.BankStmtStatus.PENDING),
            debitTotal: round2(saved.reduce((a, r) => a + r.debit, 0)),
            creditTotal: round2(saved.reduce((a, r) => a + r.credit, 0)),
            bankAccountName: bank.name,
        };
    }
    // ==================== 查询 ====================
    async findAll(query) {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 50;
        const qb = this.repo.createQueryBuilder('r');
        if (query.status)
            qb.andWhere('r.status = :status', { status: query.status });
        if (query.batchId)
            qb.andWhere('r.batchId = :batchId', { batchId: query.batchId });
        if (query.startDate)
            qb.andWhere('r.rowDate >= :startDate', { startDate: query.startDate });
        if (query.endDate)
            qb.andWhere('r.rowDate <= :endDate', { endDate: query.endDate });
        if (query.keyword) {
            qb.andWhere('(r.summary LIKE :kw OR r.counterName LIKE :kw OR r.flowNo LIKE :kw)', {
                kw: `%${query.keyword}%`,
            });
        }
        const [list, total] = await qb
            .orderBy('r.rowDate', 'ASC')
            .addOrderBy('r.createdAt', 'ASC')
            .skip((page - 1) * pageSize)
            .take(pageSize)
            .getManyAndCount();
        return { list, total, page, pageSize };
    }
    /** 汇总：各状态计数 + 借贷合计 */
    async summary() {
        const rows = await this.repo.find();
        const pick = (s) => rows.filter((r) => r.status === s);
        return {
            total: rows.length,
            booked: pick(business_entity_1.BankStmtStatus.BOOKED).length,
            matched: pick(business_entity_1.BankStmtStatus.MATCHED).length,
            pending: pick(business_entity_1.BankStmtStatus.PENDING).length,
            skipped: pick(business_entity_1.BankStmtStatus.SKIPPED).length,
            debitTotal: round2(rows.reduce((a, r) => a + r.debit, 0)),
            creditTotal: round2(rows.reduce((a, r) => a + r.credit, 0)),
            pendingDebit: round2(pick(business_entity_1.BankStmtStatus.PENDING).reduce((a, r) => a + r.debit, 0)),
            pendingCredit: round2(pick(business_entity_1.BankStmtStatus.PENDING).reduce((a, r) => a + r.credit, 0)),
        };
    }
    // ==================== 入账 / 状态操作 ====================
    /** 待确认行入账：复用现金银行单据链路自动生成凭证 */
    async book(id, dto, operator) {
        const row = await this.mustFind(id);
        if (row.status !== business_entity_1.BankStmtStatus.PENDING) {
            throw new common_1.BadRequestException('只有「待确认」状态的流水行可以入账');
        }
        const amount = row.debit > 0 ? row.debit : row.credit;
        if (amount <= 0)
            throw new common_1.BadRequestException('流水行金额异常');
        if (dto.bizType === 'transfer')
            throw new common_1.BadRequestException('流水行入账不支持内部转账，请到现金银行手动录入');
        const cashFlow = await this.cashBankService.create({
            bizType: dto.bizType,
            bizDate: row.rowDate,
            bankAccountId: row.bankAccountId,
            accountId: dto.accountId,
            partnerId: dto.partnerId || row.suggestPartnerId || null,
            employeeId: dto.employeeId || row.suggestEmployeeId || null,
            amount,
            summary: (dto.summary || row.summary || row.counterName || '银行流水').slice(0, 180),
            remark: row.flowNo ? `银行流水 ${row.flowNo}` : null,
        }, operator, true);
        row.status = business_entity_1.BankStmtStatus.BOOKED;
        row.cashFlowId = cashFlow.id;
        row.voucherId = cashFlow.voucherId;
        row.matchInfo = `已入账（${labelOf(dto.bizType)}）`;
        row.remark = row.flowNo ? `银行流水 ${row.flowNo}` : row.remark;
        await this.repo.save(row);
        return this.toVo(row);
    }
    /**
     * 一键智能批量入账：把所有「高置信建议」的待确认行（利息/手续费/员工往来/
     * 往来单位回款/工资社保等固定关键词）按建议科目自动入账。
     * 逐行复用 book()，单行失败不阻断其余行（如员工往来科目要求辅助核算等），
     * 失败行保留待确认状态并返回原因，供人工逐行处理。
     */
    async batchBook(operator) {
        const rows = await this.repo.find({
            where: { status: business_entity_1.BankStmtStatus.PENDING, autoBookable: 1 },
        });
        const targets = rows.filter((r) => r.suggestBizType && r.suggestAccountId && r.suggestBizType !== 'transfer');
        const failed = [];
        let booked = 0;
        for (const row of targets) {
            try {
                await this.book(row.id, {
                    bizType: row.suggestBizType,
                    accountId: row.suggestAccountId,
                    partnerId: row.suggestPartnerId ?? undefined,
                }, operator);
                booked++;
            }
            catch (err) {
                failed.push({
                    id: row.id,
                    summary: row.summary || row.counterName || row.id,
                    reason: err.message ?? '入账失败',
                });
            }
        }
        return { total: targets.length, booked, failed };
    }
    /** 标记跳过：该行已在其他模块记账或无需记账 */
    async skip(id, remark) {
        const row = await this.mustFind(id);
        if (row.status === business_entity_1.BankStmtStatus.BOOKED)
            throw new common_1.BadRequestException('已入账的流水行不能跳过，请先删除对应资金单据');
        row.status = business_entity_1.BankStmtStatus.SKIPPED;
        row.matchInfo = remark || row.matchInfo || '已跳过';
        if (remark)
            row.remark = remark;
        await this.repo.save(row);
        return this.toVo(row);
    }
    /** 撤销跳过/取消匹配，回到待确认 */
    async restore(id) {
        const row = await this.mustFind(id);
        if (row.status === business_entity_1.BankStmtStatus.BOOKED)
            throw new common_1.BadRequestException('已入账的流水行不能恢复');
        row.status = business_entity_1.BankStmtStatus.PENDING;
        row.matchInfo = '人工恢复为待确认';
        await this.repo.save(row);
        return this.toVo(row);
    }
    /** 删除流水行（已入账的联动删除资金单据与凭证） */
    async remove(id, operator) {
        const row = await this.mustFind(id);
        if (row.cashFlowId) {
            await this.cashBankService.remove(row.cashFlowId, operator);
        }
        await this.repo.delete({ id });
        return { message: '删除成功' };
    }
    /** 按批次删除（未入账的行） */
    async removeBatch(batchId, operator) {
        const rows = await this.repo.find({ where: { batchId } });
        if (!rows.length)
            throw new common_1.NotFoundException('批次不存在');
        const booked = rows.filter((r) => r.status === business_entity_1.BankStmtStatus.BOOKED);
        if (booked.length) {
            throw new common_1.BadRequestException(`批次内有 ${booked.length} 行已入账，请先在列表中删除已入账行`);
        }
        await this.repo.delete({ batchId });
        void operator;
        return { message: `已删除 ${rows.length} 行流水` };
    }
    // ==================== 匹配逻辑 ====================
    async loadMatchContext() {
        const accounts = new Map();
        const codes = [...Object.values(CODE), ...KEYWORD_RULES.map((r) => r.code)];
        for (const code of codes) {
            if (accounts.has(code))
                continue;
            const acc = await this.accountRepo.findOne({ where: { code } });
            if (acc)
                accounts.set(code, acc);
        }
        const partners = await this.partnerRepo.find();
        const loans = await this.loanRepo.find({ where: { status: 'approved' } });
        const employees = await this.employeeRepo.find();
        return { accounts, partners, loans, employees };
    }
    /** 逐行匹配。规则按优先级：利息/手续费 → 借款单 → 员工往来 → 往来单位 → 关键词 → 待确认 */
    buildRow(r, batchId, bankAccountId, ctx) {
        const row = this.repo.create({
            batchId,
            bankAccountId,
            rowDate: r.rowDate,
            summary: r.summary ?? '',
            counterName: r.counterName,
            counterAccount: r.counterAccount,
            flowNo: r.flowNo,
            debit: r.debit,
            credit: r.credit,
            balance: r.balance,
            status: business_entity_1.BankStmtStatus.PENDING,
            matchInfo: '',
            suggestBizType: null,
            suggestAccountId: null,
            suggestAccountCode: null,
            suggestAccountName: null,
            suggestPartnerId: null,
            suggestEmployeeId: null,
            autoBookable: 0,
            remark: r.flowNo ? `银行流水 ${r.flowNo}` : null,
        });
        const text = `${r.summary ?? ''} ${r.counterName ?? ''}`;
        const isInflow = r.credit > 0;
        // 1) 利息收入 / 银行手续费：模式固定，直接给建议（高置信，可批量入账）
        if (isInflow && INTEREST_RE.test(text)) {
            this.suggest(row, 'income', ctx.accounts.get(CODE.INTEREST_INCOME), '识别为存款利息', { auto: true });
            return row;
        }
        if (!isInflow && FEE_RE.test(text)) {
            this.suggest(row, 'payment', ctx.accounts.get(CODE.BANK_FEE), '识别为银行手续费', { auto: true });
            return row;
        }
        // 2) 支出匹配已审核借款单（金额相等 + 日期±1天 + 员工名命中）→ 已有凭证，不重复记账
        if (!isInflow) {
            const hit = this.matchLoan(r, ctx);
            if (hit) {
                row.status = business_entity_1.BankStmtStatus.MATCHED;
                row.matchInfo = `匹配借款单 ${hit}（已生成凭证，无需重复记账）`;
                return row;
            }
        }
        // 3) 对私转账：对方户名命中员工档案 → 挂员工往来（其他应收款）待核实，避免误计费用/收入
        if (r.counterName) {
            const emp = this.matchEmployee(r.counterName, ctx.employees);
            if (emp) {
                this.suggest(row, isInflow ? 'receipt' : 'payment', ctx.accounts.get(CODE.EMPLOYEE_RECEIVABLE), `对方户名为员工「${emp.name}」，建议挂员工往来（其他应收款）待核实`, { auto: true, employeeId: emp.id });
                return row;
            }
        }
        // 4) 收入匹配往来单位 → 收款冲应收
        if (isInflow && r.counterName) {
            const partner = this.matchPartner(r.counterName, ctx.partners);
            if (partner) {
                row.suggestPartnerId = partner.id;
                this.suggest(row, 'receipt', ctx.accounts.get(CODE.RECEIVABLE), `识别为「${partner.name}」回款，建议冲应收账款`, {
                    auto: true,
                });
                return row;
            }
        }
        // 4.5) 常见摘要关键词（工资/社保/公积金/税费/房租/贷款利息）：固定模式高置信建议
        if (!isInflow) {
            const kw = this.matchKeywordRule(text, ctx.accounts);
            if (kw) {
                this.suggest(row, 'payment', kw.account, kw.label, { auto: true });
                return row;
            }
        }
        // 5) 其余：待确认 + 保守建议（收入挂往来、支出挂管理费用，由用户确认后入账）
        row.matchInfo = isInflow ? '未识别收款性质，请确认对方科目' : '未识别支出性质，请确认费用科目';
        this.suggest(row, isInflow ? 'income' : 'expense', ctx.accounts.get(isInflow ? CODE.OTHER_PAYABLE : CODE.ADMIN_EXPENSE), null);
        return row;
    }
    matchLoan(r, ctx) {
        const cents = toCents(r.debit);
        const t = Date.parse(r.rowDate);
        for (const loan of ctx.loans) {
            if (toCents(Number(loan.amount)) !== cents)
                continue;
            const ld = loan.loanDate ? Date.parse(String(loan.loanDate)) : NaN;
            if (isNaN(ld) || Math.abs(ld - t) > 36 * 3600 * 1000)
                continue;
            if (loan.employeeName && (r.counterName ?? '').includes(loan.employeeName))
                return loan.loanNo;
        }
        return null;
    }
    matchPartner(counterName, partners) {
        const a = clean(counterName);
        if (a.length < 4)
            return null;
        for (const p of partners) {
            const b = clean(p.name);
            if (b.length >= 4 && (a.includes(b) || b.includes(a)))
                return p;
        }
        return null;
    }
    /** 对方户名命中员工姓名（全等或包含，姓名至少2字） */
    matchEmployee(counterName, employees) {
        const a = clean(counterName);
        if (a.length < 2)
            return null;
        for (const e of employees) {
            const b = clean(e.name);
            if (b.length >= 2 && (a === b || a.includes(b)))
                return e;
        }
        return null;
    }
    suggest(row, bizType, account, info, opts) {
        row.suggestBizType = bizType;
        if (account) {
            row.suggestAccountId = account.id;
            row.suggestAccountCode = account.code;
            row.suggestAccountName = account.name;
        }
        if (info)
            row.matchInfo = info;
        if (opts?.employeeId !== undefined)
            row.suggestEmployeeId = opts.employeeId;
        row.autoBookable = opts?.auto ? 1 : 0;
    }
    /** 摘要关键词命中建议科目（科目不存在则跳过，回落保守建议） */
    matchKeywordRule(text, accounts) {
        for (const rule of KEYWORD_RULES) {
            if (!rule.re.test(text))
                continue;
            const account = accounts.get(rule.code);
            if (!account)
                continue;
            return { account, label: rule.label };
        }
        return null;
    }
    async mustFind(id) {
        const row = await this.repo.findOne({ where: { id } });
        if (!row)
            throw new common_1.NotFoundException('流水行不存在');
        return row;
    }
    toVo(row) {
        return { ...row };
    }
};
exports.BankStmtService = BankStmtService;
exports.BankStmtService = BankStmtService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, company_repo_decorator_1.InjectCompanyRepo)(business_entity_1.BankStmtRow)),
    __param(1, (0, company_repo_decorator_1.InjectCompanyRepo)(account_entity_1.Account)),
    __param(2, (0, company_repo_decorator_1.InjectCompanyRepo)(bank_account_entity_1.BankAccount)),
    __param(3, (0, company_repo_decorator_1.InjectCompanyRepo)(partner_entity_1.Partner)),
    __param(4, (0, company_repo_decorator_1.InjectCompanyRepo)(hr_entity_1.Loan)),
    __param(5, (0, company_repo_decorator_1.InjectCompanyRepo)(hr_entity_1.Employee)),
    __metadata("design:paramtypes", [company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        cash_bank_service_1.CashBankService])
], BankStmtService);
function labelOf(bizType) {
    const map = { receipt: '收款', payment: '付款', expense: '费用支出', income: '其他收入' };
    return map[bizType] ?? bizType;
}
function clean(s) {
    return (s ?? '').replace(/[\s（）()\-—_]/g, '');
}
function toCents(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100);
}
function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}
