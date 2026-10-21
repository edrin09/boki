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
exports.ClassifyService = exports.KIND_LABELS = void 0;
const common_1 = require("@nestjs/common");
const classify_rule_entity_1 = require("@core/entities/classify-rule.entity");
const account_entity_1 = require("@core/entities/account.entity");
const hr_entity_1 = require("@core/entities/hr.entity");
const company_repository_1 = require("@core/common/company/company.repository");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
const system_service_1 = require("@core/modules/system/system.service");
const filename_util_1 = require("@core/common/utils/filename.util");
const enums_1 = require("@core/common/enums");
const parser_utils_1 = require("@plugin/ocr/server/modules/ocr/parsers/parser.utils");
exports.KIND_LABELS = {
    input_vat: '进项发票',
    output_vat: '销项发票',
    expense: '费用票据',
    bank_fee: '银行手续费',
    payroll: '工资发放',
    unknown: '无法自动归类',
};
/** 银行手续费关键词：命中则按手续费模板 */
const BANK_FEE_KEYWORDS = ['手续费', '工本费', '年费', '账户管理费', '汇费', '短信服务费', '网银服务费'];
/** 进项发票默认费用科目（未命中规则时） */
const DEFAULT_EXPENSE_CODE = '6602'; // 管理费用
/** 销项发票默认收入科目 */
const DEFAULT_INCOME_CODE = '6001'; // 营业收入
/** 进项税科目 */
const VAT_INPUT_CODE = '2221.01'; // 应交税费-应交增值税
/** 销项税科目 */
const VAT_OUTPUT_CODE = '2221.01';
/** 应付账款 / 应收账款 / 其他应付款 / 财务费用-手续费 / 银行存款 */
const PAYABLE_CODE = '2202';
const RECEIVABLE_CODE = '1122';
const OTHER_PAYABLE_CODE = '2241';
const FEE_CODE = '6701.03';
const BANK_CODE = '1002';
/** 应付职工薪酬-工资 / 应交税费-应交个人所得税（工资凭证用） */
const PAYROLL_PAYABLE_CODE = '2211.01';
const INCOME_TAX_PAYABLE_CODE = '2221.04';
let ClassifyService = class ClassifyService {
    ruleRepo;
    accountRepo;
    employeeRepo;
    systemService;
    constructor(ruleRepo, accountRepo, employeeRepo, systemService) {
        this.ruleRepo = ruleRepo;
        this.accountRepo = accountRepo;
        this.employeeRepo = employeeRepo;
        this.systemService = systemService;
    }
    /**
     * 归类一张票据：方向判定（本公司税号比对）+ 规则命中 + 分录模板生成。
     * 纯计算，不落库。opts.countHit=false 时不递增规则命中次数（供修正回写等内部复用）。
     */
    async suggest(receipt, opts) {
        const fields = this.parseFields(receipt);
        const text = receipt.rawText ?? '';
        const docType = receipt.receiptType;
        const company = await this.systemService.getCompanyInfo();
        const buyerTaxNo = this.str(fields.buyer_tax_no);
        const sellerTaxNo = this.str(fields.seller_tax_no);
        const buyerName = this.str(fields.buyer_name);
        const sellerName = this.str(fields.seller_name);
        let kind = 'unknown';
        let direction = null;
        /** 个人抬头归属员工姓名（买方命中在职员工时判定） */
        let ownerName = null;
        if (docType === 'invoice') {
            // 人工修正的方向优先：用户已在工作台纠正过进项/销项，不再依赖税号比对
            if (receipt.directionOverride === 'input' || receipt.directionOverride === 'output') {
                direction = receipt.directionOverride;
                kind = direction === 'input' ? 'input_vat' : 'output_vat';
            }
            else {
                // 方向判定：以本公司纳税人识别号比对购销方。
                // 税号比对带 I/O→1/0 归一化容错（OCR 可能把 1/0 误读成 I/O）；
                // 名称比对与 party-sync 的 isSelfCompany 同口径：去空白后互相包含
                // （票面名可能缺「(个体工商户)」等后缀，单向包含会漏配）。
                const companyTax = this.str(company.taxNo);
                const companyName = (0, parser_utils_1.normName)(this.str(company.companyName));
                const sellerIsSelf = (0, parser_utils_1.sameTaxNo)(sellerTaxNo, companyTax) ||
                    (companyName !== '' && (0, parser_utils_1.nameContains)((0, parser_utils_1.normName)(sellerName), companyName));
                const buyerIsSelf = (0, parser_utils_1.sameTaxNo)(buyerTaxNo, companyTax) ||
                    (companyName !== '' && (0, parser_utils_1.nameContains)((0, parser_utils_1.normName)(buyerName), companyName));
                if (sellerIsSelf) {
                    kind = 'output_vat';
                    direction = 'output';
                }
                else if (buyerIsSelf) {
                    kind = 'input_vat';
                    direction = 'input';
                }
                else {
                    // 购销双方均与本公司不匹配时，先尝试个人抬头判定：
                    // 买方名称命中在职员工 → 自动判为进项（员工个人垫付取得的票据，据实报销入费用），
                    // 归属员工供工作台直接生成报销单草稿；仍判不出才标 unknown 交由人工处理，
                    // 不能默认猜成进项——猜错会使对方单位取错一侧、借贷记账方向全反（财务基础错误）。
                    const buyerEmployee = await this.matchEmployee(buyerName);
                    if (buyerEmployee) {
                        kind = 'input_vat';
                        direction = 'input';
                        ownerName = buyerEmployee.name;
                    }
                    else {
                        kind = 'unknown';
                        direction = null;
                    }
                }
            }
        }
        else if (docType === 'payroll') {
            kind = 'payroll';
        }
        else if (docType === 'bank_statement') {
            // 对账单只把能直接入账的费用类摘要做成凭证，其余流水需人工/流水导入处理
            kind = this.num(fields.fee_amount) !== null ? 'bank_fee' : 'unknown';
        }
        else if (docType === 'train_ticket' || docType === 'receipt') {
            if (BANK_FEE_KEYWORDS.some((k) => text.includes(k))) {
                kind = 'bank_fee';
            }
            else {
                kind = 'expense';
            }
        }
        const confidence = receipt.confidence;
        if (kind === 'unknown') {
            return {
                kind,
                kindLabel: exports.KIND_LABELS[kind],
                direction,
                docType,
                confidence,
                hitChain: [],
                account: null,
                counterparty: null,
                entries: [],
                ownerName: null,
                message: this.unknownReason(receipt),
            };
        }
        // 规则命中：按优先级排序，keyword 规则匹配全文，partner 规则匹配交易对手
        const rules = await this.ruleRepo.find({
            where: { enabled: 1 },
            order: { priority: 'DESC', createdAt: 'ASC' },
        });
        const counterparty = kind === 'output_vat' ? buyerName : sellerName || buyerName;
        const hitChain = [];
        let targetAccountCode = kind === 'output_vat' ? DEFAULT_INCOME_CODE : DEFAULT_EXPENSE_CODE;
        let matched = null;
        for (const rule of rules) {
            let ok = false;
            if (rule.matchType === 'keyword') {
                const keywords = rule.matchValue.split(/[,，;；\s]+/).filter(Boolean);
                ok = keywords.some((k) => text.includes(k));
            }
            else if (rule.matchType === 'partner') {
                ok = Boolean(counterparty && counterparty.includes(rule.matchValue));
            }
            if (!ok)
                continue;
            hitChain.push({
                ruleName: rule.ruleName,
                matchType: rule.matchType,
                matchValue: rule.matchValue,
                priority: rule.priority,
                targetAccountCode: rule.targetAccountCode,
                kind: rule.kind,
            });
            if (!matched && this.kindCompatible(rule.kind, kind)) {
                matched = rule;
                targetAccountCode = rule.targetAccountCode;
            }
        }
        // 命中计数（仅统计最终采用的规则；内部复用时可不计数）
        if (matched && opts?.countHit !== false) {
            await this.ruleRepo.increment({ id: matched.id }, 'hitCount', 1);
        }
        const account = await this.resolveAccountName(targetAccountCode);
        // 按模板类型生成分录（金额在草稿生成时再解析）
        let entries = [];
        const summaryBase = counterparty || (((0, filename_util_1.recoverFilename)(receipt.fileName) ?? receipt.fileName).replace(/\.[^.]+$/, ''));
        if (kind === 'input_vat') {
            const tax = this.num(fields.tax_amount);
            // 进项税额能否抵扣取决于纳税人类型：
            // 一般纳税人按「不含税金额 + 进项税额」价税分离；
            // 小规模纳税人进项不得抵扣，价税合计全额计入费用科目。
            const canDeductInput = company.taxpayerType === enums_1.TaxpayerType.GENERAL;
            // 红字发票税额为负数，同样按价税分离处理（草稿生成时会取绝对值并对调借贷方向）
            if (canDeductInput && tax !== null && tax !== 0) {
                entries = [
                    { summary: `${summaryBase} 采购费用`, accountCode: targetAccountCode, direction: 'debit', amountSource: 'amount', partnerField: 'seller_name' },
                    { summary: `${summaryBase} 进项税额`, accountCode: VAT_INPUT_CODE, direction: 'debit', amountSource: 'tax_amount', partnerField: null },
                    { summary: `${summaryBase} 应付货款`, accountCode: PAYABLE_CODE, direction: 'credit', amountSource: 'total_amount', partnerField: 'seller_name' },
                ];
            }
            else {
                entries = [
                    { summary: `${summaryBase} 采购费用`, accountCode: targetAccountCode, direction: 'debit', amountSource: 'total_amount', partnerField: 'seller_name' },
                    { summary: `${summaryBase} 应付货款`, accountCode: PAYABLE_CODE, direction: 'credit', amountSource: 'total_amount', partnerField: 'seller_name' },
                ];
            }
        }
        else if (kind === 'output_vat') {
            const tax = this.num(fields.tax_amount);
            // 红字发票税额为负数，同样按价税分离处理（草稿生成时会取绝对值并对调借贷方向）
            if (tax !== null && tax !== 0) {
                entries = [
                    { summary: `${summaryBase} 销售货款`, accountCode: RECEIVABLE_CODE, direction: 'debit', amountSource: 'total_amount', partnerField: 'buyer_name' },
                    { summary: `${summaryBase} 销售收入`, accountCode: targetAccountCode, direction: 'credit', amountSource: 'amount', partnerField: 'buyer_name' },
                    { summary: `${summaryBase} 销项税额`, accountCode: VAT_OUTPUT_CODE, direction: 'credit', amountSource: 'tax_amount', partnerField: null },
                ];
            }
            else {
                entries = [
                    { summary: `${summaryBase} 销售货款`, accountCode: RECEIVABLE_CODE, direction: 'debit', amountSource: 'total_amount', partnerField: 'buyer_name' },
                    { summary: `${summaryBase} 销售收入`, accountCode: targetAccountCode, direction: 'credit', amountSource: 'total_amount', partnerField: 'buyer_name' },
                ];
            }
        }
        else if (kind === 'bank_fee') {
            // 对账单优先取费用合计，回落价税合计/金额
            const src = docType === 'bank_statement' ? 'fee_amount' : 'total_amount';
            entries = [
                { summary: `银行手续费（${summaryBase}）`, accountCode: FEE_CODE, direction: 'debit', amountSource: src, partnerField: null },
                { summary: `银行手续费（${summaryBase}）`, accountCode: BANK_CODE, direction: 'credit', amountSource: src, partnerField: null },
            ];
        }
        else if (kind === 'payroll') {
            // 工资发放汇总凭证：借 应付职工薪酬-工资，贷 银行存款 + 代扣项目
            entries = [
                { summary: `${summaryBase} 应发工资`, accountCode: PAYROLL_PAYABLE_CODE, direction: 'debit', amountSource: 'gross_amount', partnerField: null },
            ];
            const net = this.num(fields.net_amount);
            if (net !== null && net > 0) {
                entries.push({
                    summary: `${summaryBase} 实发工资`,
                    accountCode: BANK_CODE,
                    direction: 'credit',
                    amountSource: 'net_amount',
                    partnerField: null,
                });
            }
            const incomeTax = this.num(fields.income_tax);
            if (incomeTax !== null && incomeTax > 0) {
                entries.push({
                    summary: `${summaryBase} 代扣个人所得税`,
                    accountCode: INCOME_TAX_PAYABLE_CODE,
                    direction: 'credit',
                    amountSource: 'income_tax',
                    partnerField: null,
                });
            }
            const social = this.num(fields.social_deduct);
            if (social !== null && social > 0) {
                entries.push({
                    summary: `${summaryBase} 代扣社保公积金`,
                    accountCode: OTHER_PAYABLE_CODE,
                    direction: 'credit',
                    amountSource: 'social_deduct',
                    partnerField: null,
                });
            }
        }
        else {
            // expense：借费用 贷其他应付款
            entries = [
                { summary: `${summaryBase} 费用`, accountCode: targetAccountCode, direction: 'debit', amountSource: 'total_amount', partnerField: 'seller_name' },
                { summary: `${summaryBase} 应付款项`, accountCode: OTHER_PAYABLE_CODE, direction: 'credit', amountSource: 'total_amount', partnerField: 'seller_name' },
            ];
        }
        const message = matched
            ? `命中规则「${matched.ruleName}」，费用计入 ${targetAccountCode}`
            : `未命中自定义规则，按默认模板归为${exports.KIND_LABELS[kind]}`;
        return {
            kind,
            kindLabel: exports.KIND_LABELS[kind],
            direction,
            docType,
            confidence,
            hitChain,
            account,
            counterparty,
            entries,
            ownerName,
            message: ownerName
                ? `个人抬头发票：买方为员工「${ownerName}」，已自动判定为进项，可直接生成该员工的报销单草稿${message ? `；${message}` : ''}`
                : message,
        };
    }
    /**
     * 个人抬头判定：买方名称命中在职员工档案（去空白后全等或包含，姓名至少 2 字）。
     * 与银行流水的员工匹配同口径。
     */
    async matchEmployee(name) {
        const a = (0, parser_utils_1.normName)(name);
        if (a.length < 2)
            return null;
        const employees = await this.employeeRepo.find({
            where: { status: enums_1.EmployeeStatus.ON_JOB },
        });
        for (const e of employees) {
            const b = (0, parser_utils_1.normName)(e.name);
            if (b.length >= 2 && (a === b || a.includes(b) || b.includes(a)))
                return e;
        }
        return null;
    }
    /**
     * 无法自动归类时的原因说明。
     * 区分"识别成不支持的类型"与"识别对了但缺公司信息"，
     * 避免用户看到"请完善公司信息"却不知道自己上传的是张工资表。
     */
    unknownReason(receipt) {
        const supported = {
            invoice: '增值税发票',
            train_ticket: '火车票/行程单',
            receipt: '通用收据',
        };
        const typeName = receipt.receiptTypeName || '未知单据';
        if (!supported[receipt.receiptType]) {
            return `已识别为「${typeName}」，该单据暂不支持自动记账，请人工处理或上传原始票据`;
        }
        return `已识别为「${typeName}」，但无法判断进项/销项方向，请在「公司信息」中完善纳税人识别号后重试，或人工处理`;
    }
    /** 规则模板与票据类别是否兼容（进项/费用归 expense 模板，销项归 income 模板） */
    kindCompatible(ruleKind, receiptKind) {
        if (ruleKind === 'income')
            return receiptKind === 'output_vat';
        if (ruleKind === 'expense') {
            return receiptKind === 'input_vat' || receiptKind === 'expense' || receiptKind === 'bank_fee';
        }
        return true;
    }
    parseFields(receipt) {
        const map = {};
        if (receipt.structured) {
            try {
                const parsed = JSON.parse(receipt.structured);
                for (const f of parsed.fields ?? [])
                    map[f.key] = f.value;
            }
            catch {
                // ignore
            }
        }
        return map;
    }
    async resolveAccountName(code) {
        const account = await this.accountRepo.findOne({ where: { code } });
        return account ? { code: account.code, name: account.name } : { code, name: code };
    }
    str(v) {
        if (v === null || v === undefined)
            return '';
        return String(v).trim();
    }
    num(v) {
        if (v === null || v === undefined)
            return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
};
exports.ClassifyService = ClassifyService;
exports.ClassifyService = ClassifyService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, company_repo_decorator_1.InjectCompanyRepo)(classify_rule_entity_1.ClassifyRule)),
    __param(1, (0, company_repo_decorator_1.InjectCompanyRepo)(account_entity_1.Account)),
    __param(2, (0, company_repo_decorator_1.InjectCompanyRepo)(hr_entity_1.Employee)),
    __metadata("design:paramtypes", [company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        system_service_1.SystemService])
], ClassifyService);
