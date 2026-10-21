"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.entities = exports.module = void 0;
const projects_module_1 = require("./modules/projects/projects.module");
exports.module = projects_module_1.ProjectsModule;
// 迁移过渡期：Project 由内核实体注册（凭证/期初余额等内核模块引用它）。
// 实体归属随最终批次迁入插件后，再改为 [Project]。
exports.entities = [];
