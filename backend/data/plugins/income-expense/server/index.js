"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.entities = exports.module = exports.IncomeExpensePluginModule = void 0;
const common_1 = require("@nestjs/common");
const income_expense_module_1 = require("./modules/income-expense/income-expense.module");
const fixed_expense_module_1 = require("./modules/fixed-expense/fixed-expense.module");
let IncomeExpensePluginModule = class IncomeExpensePluginModule {
};
exports.IncomeExpensePluginModule = IncomeExpensePluginModule;
exports.IncomeExpensePluginModule = IncomeExpensePluginModule = __decorate([
    (0, common_1.Module)({
        imports: [income_expense_module_1.IncomeExpenseModule, fixed_expense_module_1.FixedExpenseModule],
    })
], IncomeExpensePluginModule);
exports.module = IncomeExpensePluginModule;
// 迁移过渡期：IncomeExpense / FixedExpense* 由内核实体注册，迁完实体后再改为对应实体数组。
exports.entities = [];
