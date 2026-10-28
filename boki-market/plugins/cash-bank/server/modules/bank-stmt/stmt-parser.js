"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.readGrid = readGrid;
exports.parseStatement = parseStatement;
const XLSX = __importStar(require("xlsx"));
/** 读取 Excel/CSV 为字符串网格（日期单元格转为 Date 对象保留） */
function readGrid(buffer, originalName) {
    if (/\.csv$/i.test(originalName) || /^text\/csv/.test(originalName)) {
        return parseCsvGrid(buffer);
    }
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
}
/** 在前几行里定位表头并映射列索引 */
function findHeader(grid) {
    for (let i = 0; i < Math.min(grid.length, 8); i++) {
        const cells = grid[i].map((c) => String(c ?? '').trim());
        const joined = cells.join('|');
        if (!joined.includes('日期'))
            continue;
        const find = (...patterns) => {
            for (const p of patterns) {
                const idx = cells.findIndex((c) => p.test(c));
                if (idx >= 0)
                    return idx;
            }
            return -1;
        };
        const cols = {
            date: find(/^交易日期$/, /交易日期/, /记账日期/, /日期/),
            type: find(/交易类型/, /业务类型/),
            summary: find(/摘要/, /用途/, /附言/, /备注/),
            counter: find(/对方户名/, /对方名称/, /对方单位/, /收款人/, /付款人/, /对方/),
            counterAcct: find(/对方账号/, /对方账户/, /对方卡号/),
            debit: find(/借方发生额/, /支出金额/, /借方金额/, /付款金额/, /^支出$/, /支出/),
            credit: find(/贷方发生额/, /收入金额/, /贷方金额/, /收款金额/, /^收入$/, /收入/),
            balance: find(/余额/),
            flowNo: find(/流水号/, /交易序号/, /交易流水号/),
        };
        if (cols.date < 0 || (cols.debit < 0 && cols.credit < 0))
            continue;
        return { rowIndex: i, cols };
    }
    return null;
}
/**
 * 解析对账单为流水行。只保留：能识别日期 且（支出>0 或 收入>0）的明细行。
 * 合计行/表头行因无日期自动跳过。
 */
function parseStatement(buffer, originalName) {
    const grid = readGrid(buffer, originalName);
    const header = findHeader(grid);
    if (!header) {
        throw new Error('未识别出对账单表头，请确认文件含「日期 / 摘要 / 支出(借方) / 收入(贷方)」等列');
    }
    const { rowIndex, cols } = header;
    const out = [];
    for (let i = rowIndex + 1; i < grid.length; i++) {
        const cells = grid[i].map((c) => c);
        const date = parseDate(cells[cols.date]);
        if (!date)
            continue;
        const debit = cols.debit >= 0 ? parseMoney(cells[cols.debit]) : 0;
        const credit = cols.credit >= 0 ? parseMoney(cells[cols.credit]) : 0;
        if (debit <= 0 && credit <= 0)
            continue;
        const str = (idx) => (idx >= 0 ? String(cells[idx] ?? '').trim() : '');
        const type = str(cols.type);
        const summary = str(cols.summary);
        out.push({
            rowDate: date,
            summary: [type, summary].filter(Boolean).join(' ').slice(0, 180),
            counterName: str(cols.counter) || null,
            counterAccount: str(cols.counterAcct) || null,
            flowNo: str(cols.flowNo) || null,
            debit: round2(debit),
            credit: round2(credit),
            balance: cols.balance >= 0 ? round2(parseMoney(cells[cols.balance])) : null,
        });
    }
    return out;
}
// ==================== 工具 ====================
function parseDate(v) {
    if (v instanceof Date && !isNaN(v.getTime())) {
        const y = v.getFullYear();
        const m = String(v.getMonth() + 1).padStart(2, '0');
        const d = String(v.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const s = String(v ?? '').trim();
    let m = s.match(/(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/);
    if (m)
        return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m)
        return `${m[1]}-${m[2]}-${m[3]}`;
    // Excel 日期序列号
    if (/^\d{5}(\.\d+)?$/.test(s)) {
        const d = new Date(Date.UTC(1899, 11, 30));
        d.setUTCDate(d.getUTCDate() + Math.floor(Number(s)));
        return d.toISOString().slice(0, 10);
    }
    return null;
}
function pad(n) {
    return String(Number(n)).padStart(2, '0');
}
function parseMoney(v) {
    if (typeof v === 'number')
        return isFinite(v) ? v : 0;
    const s = String(v ?? '').replace(/[^\d.\-]/g, '');
    if (!s || s === '-' || s === '.')
        return 0;
    const n = Number(s);
    return isFinite(n) ? n : 0;
}
function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}
function parseCsvGrid(buffer) {
    const text = decodeText(buffer);
    return text
        .split(/\r?\n/)
        .filter((l) => l.trim())
        .map((line) => line.split(/[,，\t]/).map((c) => c.trim().replace(/^["']|["']$/g, '')));
}
function decodeText(buffer) {
    // 尝试 UTF-8，出现乱码（CSV 常见 GBK）时退回 GBK 的近似解码
    const utf8 = buffer.toString('utf8');
    if (!utf8.includes('\uFFFD'))
        return utf8;
    try {
        const gbk = new TextDecoder('gbk');
        return gbk.decode(buffer);
    }
    catch {
        return utf8;
    }
}
