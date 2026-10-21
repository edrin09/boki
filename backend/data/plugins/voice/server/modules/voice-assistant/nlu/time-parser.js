"use strict";
/**
 * 中文时间解析（纯函数）。
 *
 * 输出期间格式 YYYYMM，与 report.dto.ts 的 startPeriod/endPeriod 一致。
 * 覆盖写法：本月/这个月/当月/上月/上个月/今年/本年/全年/年度/去年/上一年/
 * 今年十月/10月/2025年10月/去年十月/2025年1月至3月/2025年10月到12月 等，默认本月。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseChineseTime = parseChineseTime;
const CN_NUM = {
    一: 1,
    '1': 1,
    二: 2,
    '2': 2,
    两: 2,
    三: 3,
    '3': 3,
    四: 4,
    '4': 4,
    五: 5,
    '5': 5,
    六: 6,
    '6': 6,
    七: 7,
    '7': 7,
    八: 8,
    '8': 8,
    九: 9,
    '9': 9,
    十: 10,
    十一: 11,
    十二: 12,
};
/** 月份 token：外层捕获组 1（含「月」），内层捕获组 2（纯月号） */
const M = '((\\d{1,2}|[一二两三四五六七八九]|十[一二]?)\\s*月)';
const ABS_YEAR = '(\\d{4})年';
const REL_YEAR = '(今年|本年|去年|上一年)';
/** 单个月份 token → 月号（支持中文数字与阿拉伯数字） */
function monthOf(token) {
    if (!token)
        return null;
    if (CN_NUM[token] != null)
        return CN_NUM[token];
    const n = Number(token);
    return n >= 1 && n <= 12 ? n : null;
}
function resolveRelYearToken(token, year) {
    return token.includes('去年') || token.includes('上一年') ? year - 1 : year;
}
function makeLabel(startYear, startMonth, endYear, endMonth) {
    if (startYear === endYear && startMonth === 1 && endMonth === 12) {
        return `${startYear}年全年`;
    }
    if (startYear === endYear && startMonth === endMonth) {
        return `${startYear}年${endMonth}月`;
    }
    if (startYear === endYear) {
        return `${startYear}年${startMonth}至${endMonth}月`;
    }
    return `${startYear}年${startMonth}月至${endYear}年${endMonth}月`;
}
/**
 * 解析语音/文本中的时间表达。
 *
 * 未命中任何时间词时返回 null，由调用方决定是否默认本月，
 * 这样「费用明细」这类不带时间的指令与「本月费用明细」一致处理。
 */
function parseChineseTime(text) {
    const { year, month } = nowParts();
    const t = text.replace(/\s+/g, '');
    // 分组索引备忘：
    //  (\\d{4})年|(今年|本年|去年|上一年) | [(月号)月] | (\\d{4})年|(今年|…)? | [(月号)月]
    //   ^1/^2                            ^3/^4            ^5/^6             ^7/^8
    // 1) 显式年份跨年区间：2025年1月至2026年6月
    let m = new RegExp(`${ABS_YEAR}${M}(?:至|到|-|~|－)\\s*${ABS_YEAR}${M}`).exec(t);
    if (m) {
        const s = monthOf(m[4]);
        const e = monthOf(m[8]);
        if (s && e) {
            const sy = Number(m[1]);
            const ey = Number(m[5]);
            return { startPeriod: sy * 100 + s, endPeriod: ey * 100 + e, label: makeLabel(sy, s, ey, e) };
        }
    }
    // 2) 区间（年份写法任意）：2025年1月至3月 / 今年10月到12月 / 去年1月至12月 / 1月至3月
    m = new RegExp(`(?:${ABS_YEAR}|${REL_YEAR})?${M}(?:至|到|-|~|－)\\s*(?:${ABS_YEAR}|${REL_YEAR})?${M}`).exec(t);
    if (m) {
        const s = monthOf(m[4]);
        const e = monthOf(m[8]);
        if (s && e) {
            let sy = year;
            let ey = year;
            if (m[1]) {
                sy = Number(m[1]);
                ey = m[5] ? Number(m[5]) : sy; // 同年起始年份显式给出
            }
            else if (m[2]) {
                sy = resolveRelYearToken(m[2], year);
                ey = m[6] ? resolveRelYearToken(m[6], year) : sy;
            }
            else if (e < s) {
                // 裸月份且结束小于起始：视为跨年，如 11月至2月
                sy = year;
                ey = year + 1;
            }
            if (sy === ey && e < s)
                ey = sy + 1;
            return { startPeriod: sy * 100 + s, endPeriod: ey * 100 + e, label: makeLabel(sy, s, ey, e) };
        }
    }
    // 3) 显式年份 + 单月：2025年10月
    m = new RegExp(`${ABS_YEAR}${M}`).exec(t);
    if (m) {
        const mo = monthOf(m[3]);
        if (mo) {
            const y = Number(m[1]);
            return { startPeriod: y * 100 + mo, endPeriod: y * 100 + mo, label: `${y}年${mo}月` };
        }
    }
    // 4) 相对年份 + 单月：今年十月 / 去年3月（分组：1 相对年，3 月号）
    m = new RegExp(`${REL_YEAR}${M}`).exec(t);
    if (m) {
        const mo = monthOf(m[3]);
        if (mo) {
            const y = resolveRelYearToken(m[1], year);
            return { startPeriod: y * 100 + mo, endPeriod: y * 100 + mo, label: `${y}年${mo}月` };
        }
    }
    // 5) 今年 / 去年 整年
    if (/(今年|本年|全年|年度|一整年)/.test(t)) {
        return { startPeriod: year * 100 + 1, endPeriod: year * 100 + 12, label: `${year}年全年` };
    }
    if (/(去年|上一年|上年度)/.test(t)) {
        return {
            startPeriod: (year - 1) * 100 + 1,
            endPeriod: (year - 1) * 100 + 12,
            label: `${year - 1}年全年`,
        };
    }
    // 6) 本月 / 上月
    if (/(上月|上个月)/.test(t)) {
        const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
        return {
            startPeriod: prev.year * 100 + prev.month,
            endPeriod: prev.year * 100 + prev.month,
            label: `${prev.year}年${prev.month}月`,
        };
    }
    if (/(本月|这个月|当月|这一个月)/.test(t)) {
        return { startPeriod: year * 100 + month, endPeriod: year * 100 + month, label: `${year}年${month}月` };
    }
    // 7) 裸月份：十月 / 10月
    m = new RegExp(M).exec(t);
    if (m) {
        const mo = monthOf(m[2]);
        if (mo) {
            return { startPeriod: year * 100 + mo, endPeriod: year * 100 + mo, label: `${year}年${mo}月` };
        }
    }
    return null;
}
function nowParts() {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
}
