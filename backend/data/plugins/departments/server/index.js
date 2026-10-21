"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.entities = exports.module = void 0;
const departments_module_1 = require("./modules/departments/departments.module");
exports.module = departments_module_1.DepartmentsModule;
// 迁移过渡期：Department 仍由内核实体注册（凭证/期初/账簿等模块引用）。
exports.entities = [];
