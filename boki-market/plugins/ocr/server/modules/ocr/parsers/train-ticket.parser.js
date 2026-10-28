"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trainTicketParser = void 0;
const parser_utils_1 = require("./parser.utils");
exports.trainTicketParser = {
    type: 'train_ticket',
    typeName: '火车票/行程单',
    match(ctx) {
        const t = (0, parser_utils_1.norm)(ctx.rawText);
        let score = 0;
        if (t.includes('火车票'))
            score += 6;
        if (t.includes('行程信息提示'))
            score += 5;
        if (t.includes('车次'))
            score += 3;
        if (t.includes('票价'))
            score += 3;
        if (t.includes('席别'))
            score += 2;
        if (t.includes('出发'))
            score += 1;
        if (t.includes('到达'))
            score += 1;
        if (t.includes('发票') || t.includes('身份证') || t.includes('营业执照'))
            score -= 12;
        return score;
    },
    parse(ctx) {
        const { lines, rawText } = ctx;
        const fallback = ctx.source === 'pdf' ? 1 : 0.95;
        const f = [];
        const nameLine = (0, parser_utils_1.findLine)(lines, ['姓名']);
        if (nameLine) {
            const v = (0, parser_utils_1.valueAfterLabel)(nameLine.text, '姓名');
            if (v)
                f.push((0, parser_utils_1.field)('passenger', '旅客姓名', v, nameLine.score || fallback));
        }
        const idCard = (0, parser_utils_1.extractIdCard)(rawText);
        if (idCard)
            f.push((0, parser_utils_1.field)('id_card', '身份证号', idCard, fallback * 0.95));
        const trainLine = (0, parser_utils_1.findLine)(lines, ['车次']);
        if (trainLine) {
            const v = (0, parser_utils_1.valueAfterLabel)(trainLine.text, '车次');
            if (v)
                f.push((0, parser_utils_1.field)('train_no', '车次', v, trainLine.score || fallback));
        }
        const fromLine = (0, parser_utils_1.findLine)(lines, ['出发', '始发站']);
        if (fromLine) {
            const v = (0, parser_utils_1.valueAfterLabel)(fromLine.text, fromLine.text.includes('始发站') ? '始发站' : '出发');
            if (v)
                f.push((0, parser_utils_1.field)('from_station', '出发站', v, fromLine.score || fallback));
        }
        const toLine = (0, parser_utils_1.findLine)(lines, ['到达', '到达站']);
        if (toLine) {
            const v = (0, parser_utils_1.valueAfterLabel)(toLine.text, toLine.text.includes('到达站') ? '到达站' : '到达');
            if (v)
                f.push((0, parser_utils_1.field)('to_station', '到达站', v, toLine.score || fallback));
        }
        const dateLine = (0, parser_utils_1.findLine)(lines, ['日期']);
        const date = dateLine ? (0, parser_utils_1.extractDate)(dateLine.text) : (0, parser_utils_1.extractDate)(rawText);
        if (date)
            f.push((0, parser_utils_1.field)('travel_date', '乘车日期', date, dateLine?.score || fallback));
        const seatLine = (0, parser_utils_1.findLine)(lines, ['席别']);
        if (seatLine) {
            const v = (0, parser_utils_1.valueAfterLabel)(seatLine.text, '席别');
            if (v)
                f.push((0, parser_utils_1.field)('seat_class', '席别', v, seatLine.score || fallback));
        }
        const priceLine = (0, parser_utils_1.findLine)(lines, ['票价']);
        if (priceLine) {
            const v = (0, parser_utils_1.extractMoney)(priceLine.text);
            if (v !== null)
                f.push((0, parser_utils_1.field)('amount', '票价', v, priceLine.score || fallback));
        }
        return f;
    },
};
