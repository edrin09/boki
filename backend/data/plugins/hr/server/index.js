"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.entities = exports.module = void 0;
const hr_module_1 = require("./modules/hr.module");
exports.module = hr_module_1.HrPluginModule;
// 员工/报销/借款/工资实体过渡期仍由内核提供，后续再迁入本插件。
exports.entities = [];
