"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bankStatementParser = void 0;
const parser_utils_1 = require("./parser.utils");
/** 银行名称（用于摘要与往来单位命名） */
const BANKS = [
    '工商银行',
    '建设银行',
    '农业银行',
    '中国银行',
    '交通银行',
    '招商银行',
    '浦发银行',
    '兴业银行',
    '中信银行',
    '光大银行',
    '民生银行',
    '平安银行',
    '邮储银行',
    '广发银行',
    '华夏银行',
    '北京银行',
    '上海银行',
    '宁波银行',
];
/** 费用类摘要关键词 → 费用科目默认走 bank_fee 模板 */
const FEE_KEYWORDS = ['手续费', '工本费', '账户管理费', '年费', '汇费', '短信服务费', '网银服务费', '服务费', '账户费'];
/** 支出/收入侧关键词 */
const DEBIT_HINTS = ['借方发生额', '借方金额', '支出金额', '支出合计', '借方合计', '付款金额', '支出'];
const CREDIT_HINTS = ['贷方发生额', '贷方金额', '收入金额', '收入合计', '贷方合计', '收款金额', '收入'];
exports.bankStatementParser = {
    type: 'bank_statement',
    typeName: '银行对账单',
    match(ctx) {
        const t = (0, parser_utils_1.norm)(ctx.rawText);
        let score = 0;
        if (t.includes('对账单'))
            score += 7;
        if (t.includes('交易明细') || t.includes('交易流水'))
            score += 6;
        if (t.includes('账户明细') || t.includes('活期明细'))
            score += 5;
        if (t.includes('交易回单') || t.includes('电子回单'))
            score += 5;
        if (t.includes('开户行') || t.includes('账户名称'))
            score += 3;
        if (BANKS.some((b) => t.includes(b)))
            score += 3;
        // 对账单表头结构：日期 + 摘要 + 借贷发生额
        if (t.includes('借方发生额') && t.includes('贷方发生额'))
            score += 6;
        else if (t.includes('借方') && t.includes('贷方') && t.includes('余额'))
            score += 4;
        if (t.includes('余额'))
            score += 1;
        if (t.includes('发票') || t.includes('价税合计'))
            score -= 12;
        if (t.includes('身份证') || t.includes('营业执照') || t.includes('火车票'))
            score -= 12;
        if (t.includes('工资表') || t.includes('应发工资') || t.includes('实发工资'))
            score -= 8;
        if (score <= 0)
            return -100;
        return score;
    },
    parse(ctx) {
        const { lines, rawText } = ctx;
        const fallback = ctx.source === 'pdf' ? 0.95 : 0.85;
        const f = [];
        const bank = BANKS.find((b) => rawText.includes(b));
        if (bank)
            f.push((0, parser_utils_1.field)('bank_name', '开户银行', bank, fallback));
        const accountLine = (0, parser_utils_1.findLine)(lines, ['账号', '账户', '卡号']);
        if (accountLine) {
            const m = accountLine.text.match(/\d[\d\s]{7,}/);
            const account = (m ? m[0] : accountLine.text)
                .replace(/\s+/g, '')
                .replace(/[^\dXx]/g, '');
            if (account.length >= 8)
                f.push((0, parser_utils_1.field)('bank_account', '银行账号', account, fallback));
        }
        const periodLine = (0, parser_utils_1.findLine)(lines, ['账期', '所属期', '起始日期', '交易起日']);
        if (periodLine) {
            const dates = [...periodLine.text.matchAll(/(\d{4})\s*[年\-/.]\s*(\d{1,2})\s*[月\-/.]\s*(\d{1,2})/g)];
            if (dates.length >= 2) {
                const a = dates[0];
                const b = dates[dates.length - 1];
                const fmt = (m) => `${m[1]}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[3])).padStart(2, '0')}`;
                f.push((0, parser_utils_1.field)('period_start', '账期起', fmt(a), fallback));
                f.push((0, parser_utils_1.field)('period_end', '账期止', fmt(b), fallback));
            }
        }
        // 借方（支出）/贷方（收入）合计
        const debitTotal = this.findTotal(lines, DEBIT_HINTS, CREDIT_HINTS);
        const creditTotal = this.findTotal(lines, CREDIT_HINTS, DEBIT_HINTS);
        if (debitTotal !== null)
            f.push((0, parser_utils_1.field)('debit_total', '借方发生额', debitTotal, fallback));
        if (creditTotal !== null)
            f.push((0, parser_utils_1.field)('credit_total', '贷方发生额', creditTotal, fallback));
        // 费用类明细合计（手续费等）：这才是能直接生成凭证的部分
        let feeTotal = 0;
        let feeHit = 0;
        for (const line of lines) {
            const kw = FEE_KEYWORDS.find((k) => line.text.includes(k));
            if (!kw)
                continue;
            // 跳过表头行（含"借方发生额"等列名）
            if (DEBIT_HINTS.some((k) => line.text.includes(k)))
                continue;
            // 只取关键词之后的金额：明细行开头是交易日期，
            // 直接对整行取金额会把日期里的 "2026" 当成金额。
            const v = moneyAfter(line.text, kw);
            if (v === null || v === 0)
                continue;
            feeTotal += v;
            feeHit++;
        }
        // 费用合计异常（明显超过单笔手续费量级）时不生成凭证，避免错误金额入账
        const feePlausible = feeHit > 0 && feeTotal <= 100_000;
        if (feeHit > 0) {
            f.push((0, parser_utils_1.field)('fee_amount', '银行手续费', round2(feeTotal), feePlausible ? (feeHit === 1 ? fallback : fallback * 0.9) : 0.3));
            f.push((0, parser_utils_1.field)('fee_count', '费用笔数', feeHit, fallback * 0.9));
            if (!feePlausible) {
                f.push((0, parser_utils_1.field)('fee_warning', '提示', `手续费合计 ${round2(feeTotal)} 明显异常，请核对后人工处理`, 0.3));
            }
        }
        // 交易笔数：含日期且含金额的明细行
        let txnCount = 0;
        for (const line of lines) {
            if (!/\d{4}\s*[年\-/.]\s*\d{1,2}\s*[月\-/.]\s*\d{1,2}/.test(line.text))
                continue;
            if (DEBIT_HINTS.some((k) => line.text.includes(k)))
                continue;
            if ((0, parser_utils_1.extractMoney)(line.text) === null)
                continue;
            txnCount++;
        }
        if (txnCount > 0)
            f.push((0, parser_utils_1.field)('txn_count', '交易笔数', txnCount, fallback * 0.85));
        return f;
    },
    /**
     * 取合计金额。
     * 优先「借方发生额合计：xxx」这类汇总行；若只有明细则退回累加明细行。
     */
    findTotal(lines, hints, opposite) {
        // 1) 汇总行：关键词 + 合计/小计
        for (const hint of hints) {
            for (const line of lines) {
                if (!line.text.includes(hint))
                    continue;
                if (!/合计|小计|总计/.test(line.text))
                    continue;
                // 汇总行不应同时含另一侧的列名（否则是表头）
                if (opposite.some((h) => line.text.includes(h)))
                    continue;
                const money = (0, parser_utils_1.extractAllMoney)(line.text).filter((n) => n > 0);
                if (money.length)
                    return money[money.length - 1];
            }
        }
        // 2) 明细累加：跳过表头行，逐行取该侧的金额
        let sum = 0;
        let hit = 0;
        for (const line of lines) {
            const isHeader = /交易日期|日期.*摘要|摘要.*金额|余额/.test(line.text);
            if (isHeader)
                continue;
            if (!hints.some((h) => line.text.includes(h)))
                continue;
            const v = moneyAfter(line.text, hints.find((h) => line.text.includes(h)));
            if (v === null || v === 0)
                continue;
            sum += v;
            hit++;
        }
        return hit > 0 ? sum : null;
    },
};
function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}
/**
 * 只在关键词之后取金额。
 * 对账单明细行形如 "2026-09-01 手续费 35.00 0.00 9965.00"，
 * 若对整行取金额会先匹配到日期里的 "2026"。
 */
function moneyAfter(text, keyword) {
    const idx = text.indexOf(keyword);
    if (idx < 0)
        return null;
    const rest = text.slice(idx + keyword.length);
    const money = (0, parser_utils_1.extractAllMoney)(rest).filter((n) => n > 0);
    if (money.length)
        return money[0];
    return (0, parser_utils_1.extractMoney)(rest);
}
