"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUTO_SELECT_CONFIDENCE = exports.FIELD_MAP = exports.TARGET_LABELS = exports.EXPECTED_DOC_TYPE = void 0;
/** 证件类型与档案目标的对应关系，用于提示「上传的证件是否匹配」 */
exports.EXPECTED_DOC_TYPE = {
    partner: 'business_license',
    employee: 'id_card',
};
exports.TARGET_LABELS = {
    partner: '往来单位',
    employee: '员工',
};
function normalizeGender(value) {
    const s = String(value).trim();
    if (['男', '男性', 'male', 'M', 'MALE'].includes(s) || s.startsWith('男'))
        return 'male';
    if (['女', '女性', 'female', 'F', 'FEMALE'].includes(s) || s.startsWith('女'))
        return 'female';
    return 'unknown';
}
/**
 * 识别字段（解析器输出 key）→ 档案字段映射。
 * 未列出的识别字段会在结果中保留展示，但不参与表单填充。
 */
exports.FIELD_MAP = {
    partner: {
        company_name: { key: 'name', label: '名称' },
        credit_code: { key: 'taxNo', label: '纳税人识别号' },
        legal_person: { key: 'legalPerson', label: '法定代表人' },
        address: { key: 'address', label: '地址' },
    },
    employee: {
        name: { key: 'name', label: '姓名' },
        gender: { key: 'gender', label: '性别', transform: normalizeGender },
        id_card: { key: 'idCard', label: '身份证号' },
    },
};
/** 自动勾选建议：置信度低于该值的字段默认不勾选，交由人工确认 */
exports.AUTO_SELECT_CONFIDENCE = 0.6;
