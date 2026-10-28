"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.entities = exports.module = void 0;
const ar_ap_module_1 = require("./modules/ar-ap/ar-ap.module");
exports.module = ar_ap_module_1.ArApModule;
// 迁移过渡期：WriteOff 由内核实体注册，迁完实体后再改为 [WriteOff]。
exports.entities = [];
