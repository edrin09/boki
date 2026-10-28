"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.entities = exports.module = void 0;
const multi_company_module_1 = require("./modules/multi-company.module");
exports.module = multi_company_module_1.MultiCompanyModule;
// sys_company / sys_user_company 属于内核保留 schema：
// 公司上下文、登录与权限判定在插件停用/卸载后仍需工作，因此不随插件走。
exports.entities = [];
