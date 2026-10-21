"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.entities = exports.module = void 0;
const banks_module_1 = require("./modules/banks/banks.module");
exports.module = banks_module_1.BanksModule;
// 迁移过渡期：BankAccount 仍由内核实体注册（其他内核/插件模块引用它）。
// 实体归属随最终批次迁入插件后，再改为 [BankAccount]。
exports.entities = [];
