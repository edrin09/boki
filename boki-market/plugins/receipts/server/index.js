"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.entities = exports.module = void 0;
const receipts_module_1 = require("./modules/receipts/receipts.module");
exports.module = receipts_module_1.ReceiptsModule;
// 票据/归类规则实体过渡期仍由内核提供，后续再迁入本插件。
exports.entities = [];
