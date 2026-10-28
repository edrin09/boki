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
exports.buildWorkbook = buildWorkbook;
const XLSX = __importStar(require("xlsx"));
/**
 * 生成 xlsx 工作簿。
 *
 * 语音指令返回的 card 与 Excel 共用同一套列定义（IntentColumn），
 * 保证「听到的总结」与「下载的明细」数字来源一致。
 */
function buildWorkbook(title, columns, rows, footerTotals) {
    const sheetName = sanitizeSheetName(title);
    const header = columns.map((c) => c.label);
    const body = rows.map((row) => columns.map((c) => {
        const v = row[c.key];
        if (v == null)
            return '';
        if (c.numeric && typeof v === 'number')
            return v;
        return typeof v === 'number' ? v : String(v);
    }));
    const footer = footerTotals ? columns.map((c) => footerTotals[c.key] ?? '') : null;
    const aoa = [[sheetName], header, ...body];
    if (footer)
        aoa.push(footer);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // 列宽：按内容自适应，限制在 8~40
    ws['!cols'] = columns.map((c, i) => {
        let width = c.label.length * 2 + 2;
        if (c.width)
            width = Math.max(width, c.width);
        for (const r of rows) {
            const text = String(r[c.key] ?? '');
            width = Math.max(width, Math.min(40, text.length * 2 + 2));
        }
        void i;
        return { wch: Math.max(8, width) };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
/** 工作表名限制 31 字符，且不能含 : \ / ? * [ ] */
function sanitizeSheetName(title) {
    const clean = title.replace(/[:\\/?*[\]]/g, '-').trim();
    return clean.slice(0, 31) || '导出';
}
