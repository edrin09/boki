"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PARSERS = void 0;
exports.parseDocument = parseDocument;
const invoice_parser_1 = require("./invoice.parser");
const payroll_parser_1 = require("./payroll.parser");
const bank_statement_parser_1 = require("./bank-statement.parser");
const id_card_parser_1 = require("./id-card.parser");
const business_license_parser_1 = require("./business-license.parser");
const train_ticket_parser_1 = require("./train-ticket.parser");
const generic_receipt_parser_1 = require("./generic-receipt.parser");
/** 解析器注册表：按 match 分选最高者 */
exports.PARSERS = [
    invoice_parser_1.invoiceParser,
    payroll_parser_1.payrollParser,
    bank_statement_parser_1.bankStatementParser,
    id_card_parser_1.idCardParser,
    business_license_parser_1.businessLicenseParser,
    train_ticket_parser_1.trainTicketParser,
    generic_receipt_parser_1.genericReceiptParser,
];
function parseDocument(ctx) {
    let best = null;
    let bestScore = -Infinity;
    for (const p of exports.PARSERS) {
        const s = p.match(ctx);
        if (s > bestScore) {
            bestScore = s;
            best = p;
        }
    }
    const avgLineScore = ctx.lines.length > 0
        ? ctx.lines.reduce((acc, l) => acc + (l.score || 1), 0) / ctx.lines.length
        : ctx.source === 'pdf'
            ? 1
            : 0.5;
    if (!best || bestScore <= 0) {
        return {
            type: 'unknown',
            typeName: '未识别票据类型',
            matchScore: 0,
            fields: [],
            confidence: Math.round(avgLineScore * 1000) / 1000,
        };
    }
    const fields = best.parse(ctx);
    const confidence = fields.length > 0
        ? fields.reduce((acc, f) => acc + f.confidence, 0) / fields.length
        : avgLineScore;
    return {
        type: best.type,
        typeName: best.typeName,
        matchScore: bestScore,
        fields,
        confidence: Math.round(confidence * 1000) / 1000,
    };
}
