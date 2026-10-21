"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.idCardParser = void 0;
const parser_utils_1 = require("./parser.utils");
exports.idCardParser = {
    type: 'id_card',
    typeName: '居民身份证',
    match(ctx) {
        const t = (0, parser_utils_1.norm)(ctx.rawText);
        let score = 0;
        if (t.includes('居民身份证'))
            score += 6;
        if (t.includes('公民身份号码'))
            score += 5;
        if ((0, parser_utils_1.extractIdCard)(ctx.rawText))
            score += 4;
        if (t.includes('姓名'))
            score += 1;
        if (t.includes('性别'))
            score += 1;
        if (t.includes('民族'))
            score += 1;
        if (t.includes('住址'))
            score += 1;
        if (t.includes('签发机关'))
            score += 1;
        if (t.includes('发票') || t.includes('营业执照') || t.includes('火车票'))
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
                f.push((0, parser_utils_1.field)('name', '姓名', v, nameLine.score || fallback));
        }
        const genderLine = (0, parser_utils_1.findLine)(lines, ['性别']);
        if (genderLine) {
            const v = (0, parser_utils_1.valueAfterLabel)(genderLine.text, '性别');
            if (v)
                f.push((0, parser_utils_1.field)('gender', '性别', v, genderLine.score || fallback));
        }
        const nationLine = (0, parser_utils_1.findLine)(lines, ['民族']);
        if (nationLine) {
            const v = (0, parser_utils_1.valueAfterLabel)(nationLine.text, '民族');
            if (v)
                f.push((0, parser_utils_1.field)('nation', '民族', v, nationLine.score || fallback));
        }
        const birthLine = (0, parser_utils_1.findLine)(lines, ['出生']);
        if (birthLine) {
            const v = (0, parser_utils_1.extractDate)(birthLine.text) ?? (0, parser_utils_1.valueAfterLabel)(birthLine.text, '出生');
            if (v)
                f.push((0, parser_utils_1.field)('birth', '出生', v, birthLine.score || fallback));
        }
        const addrLine = (0, parser_utils_1.findLine)(lines, ['住址']);
        if (addrLine) {
            const v = (0, parser_utils_1.valueAfterLabel)(addrLine.text, '住址');
            if (v)
                f.push((0, parser_utils_1.field)('address', '住址', v, addrLine.score || fallback));
        }
        const idCard = (0, parser_utils_1.extractIdCard)(rawText);
        if (idCard)
            f.push((0, parser_utils_1.field)('id_card', '公民身份号码', idCard, fallback * 0.95));
        const issueLine = (0, parser_utils_1.findLine)(lines, ['签发机关']);
        if (issueLine) {
            const v = (0, parser_utils_1.valueAfterLabel)(issueLine.text, '签发机关');
            if (v)
                f.push((0, parser_utils_1.field)('issue_org', '签发机关', v, issueLine.score || fallback));
        }
        const validLine = (0, parser_utils_1.findLine)(lines, ['有效期限']);
        if (validLine) {
            const v = (0, parser_utils_1.valueAfterLabel)(validLine.text, '有效期限');
            if (v)
                f.push((0, parser_utils_1.field)('validity', '有效期限', v, validLine.score || fallback));
        }
        return f;
    },
};
