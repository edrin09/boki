"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RejectExpenseClaimDto = exports.PayExpenseClaimDto = exports.SaveExpenseClaimDto = exports.ExpenseClaimItemDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
/** 报销费用行 DTO */
class ExpenseClaimItemDto {
    summary;
    /** 未指定时使用主表上的默认费用科目 */
    accountId;
    amount;
    remark;
}
exports.ExpenseClaimItemDto = ExpenseClaimItemDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], ExpenseClaimItemDto.prototype, "summary", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ExpenseClaimItemDto.prototype, "accountId", void 0);
__decorate([
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 2 }, { message: '金额最多两位小数' }),
    (0, class_validator_1.Min)(0.01, { message: '金额必须大于 0' }),
    __metadata("design:type", Number)
], ExpenseClaimItemDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], ExpenseClaimItemDto.prototype, "remark", void 0);
/** 新增/编辑报销单 DTO */
class SaveExpenseClaimDto {
    /** 报销单号（可选；缺省或重复时由后端自动生成） */
    claimNo;
    claimDate;
    employeeId;
    payMethod;
    /** 付款资金账户（payMethod 为 cash/bank 时必填） */
    bankAccountId;
    /** 抵充的借款单ID（员工用借款去报销时选择；冲抵型不指定时按借款日期先后FIFO冲抵） */
    loanId;
    /** 报销单类型：loan_offset 冲抵借款 / payment 直接付款（缺省按是否指定借款单推导） */
    claimType;
    items;
    remark;
}
exports.SaveExpenseClaimDto = SaveExpenseClaimDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(30),
    __metadata("design:type", String)
], SaveExpenseClaimDto.prototype, "claimNo", void 0);
__decorate([
    (0, class_validator_1.IsDateString)({}, { message: '报销日期格式不正确' }),
    __metadata("design:type", String)
], SaveExpenseClaimDto.prototype, "claimDate", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '请选择报销人' }),
    __metadata("design:type", String)
], SaveExpenseClaimDto.prototype, "employeeId", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['advance', 'cash', 'bank'], { message: '支付方式不合法' }),
    __metadata("design:type", String)
], SaveExpenseClaimDto.prototype, "payMethod", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SaveExpenseClaimDto.prototype, "bankAccountId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SaveExpenseClaimDto.prototype, "loanId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['loan_offset', 'payment'], { message: '报销单类型不合法' }),
    __metadata("design:type", String)
], SaveExpenseClaimDto.prototype, "claimType", void 0);
__decorate([
    (0, class_validator_1.IsArray)({ message: '请至少录入一条费用明细' }),
    (0, class_validator_1.ArrayMinSize)(1, { message: '请至少录入一条费用明细' }),
    (0, class_validator_1.ArrayMaxSize)(100, { message: '明细行过多' }),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => ExpenseClaimItemDto),
    __metadata("design:type", Array)
], SaveExpenseClaimDto.prototype, "items", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], SaveExpenseClaimDto.prototype, "remark", void 0);
/** 付款 DTO */
class PayExpenseClaimDto {
    bankAccountId;
    payDate;
    remark;
}
exports.PayExpenseClaimDto = PayExpenseClaimDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '请选择付款账户' }),
    __metadata("design:type", String)
], PayExpenseClaimDto.prototype, "bankAccountId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PayExpenseClaimDto.prototype, "payDate", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], PayExpenseClaimDto.prototype, "remark", void 0);
/** 驳回 DTO */
class RejectExpenseClaimDto {
    reason;
}
exports.RejectExpenseClaimDto = RejectExpenseClaimDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '请填写驳回原因' }),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], RejectExpenseClaimDto.prototype, "reason", void 0);
