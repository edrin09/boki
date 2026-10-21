"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.entities = exports.module = exports.CashBankPluginModule = void 0;
const common_1 = require("@nestjs/common");
const cash_bank_module_1 = require("./modules/cash-bank/cash-bank.module");
const bank_stmt_module_1 = require("./modules/bank-stmt/bank-stmt.module");
let CashBankPluginModule = class CashBankPluginModule {
};
exports.CashBankPluginModule = CashBankPluginModule;
exports.CashBankPluginModule = CashBankPluginModule = __decorate([
    (0, common_1.Module)({
        imports: [cash_bank_module_1.CashBankModule, bank_stmt_module_1.BankStmtModule],
    })
], CashBankPluginModule);
exports.module = CashBankPluginModule;
// 迁移过渡期：CashFlow / BankStmtRow 仍由内核实体注册。
exports.entities = [];
