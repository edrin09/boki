"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.entities = exports.module = void 0;
const reports_module_1 = require("./modules/reports/reports.module");
exports.module = reports_module_1.ReportsModule;
// 报表只做查询，不拥有业务实体。
exports.entities = [];
