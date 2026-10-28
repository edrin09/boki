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
exports.RejectLoanDto = exports.RepayLoanDto = exports.SaveLoanDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
/** 新增/编辑借款单 DTO */
class SaveLoanDto {
    /** 借款单号（可选；缺省或重复时由后端自动生成） */
    loanNo;
    loanDate;
    employeeId;
    amount;
    reason;
    payMethod;
    /** 放款资金账户（payMethod 为 bank 时建议填写） */
    bankAccountId;
    remark;
}
exports.SaveLoanDto = SaveLoanDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(30),
    __metadata("design:type", String)
], SaveLoanDto.prototype, "loanNo", void 0);
__decorate([
    (0, class_validator_1.IsDateString)({}, { message: '借款日期格式不正确' }),
    __metadata("design:type", String)
], SaveLoanDto.prototype, "loanDate", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '请选择借款人' }),
    __metadata("design:type", String)
], SaveLoanDto.prototype, "employeeId", void 0);
__decorate([
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 2 }, { message: '借款金额最多两位小数' }),
    (0, class_validator_1.Min)(0.01, { message: '借款金额必须大于 0' }),
    __metadata("design:type", Number)
], SaveLoanDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], SaveLoanDto.prototype, "reason", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['cash', 'bank'], { message: '借款方式不合法' }),
    __metadata("design:type", String)
], SaveLoanDto.prototype, "payMethod", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SaveLoanDto.prototype, "bankAccountId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], SaveLoanDto.prototype, "remark", void 0);
/** 还款 DTO */
class RepayLoanDto {
    /** 本次还款金额（可选，缺省 = 剩余欠款全额还清） */
    amount;
    bankAccountId;
    repayMethod;
    repayDate;
    remark;
}
exports.RepayLoanDto = RepayLoanDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 2 }, { message: '还款金额最多两位小数' }),
    (0, class_validator_1.Min)(0.01, { message: '还款金额必须大于 0' }),
    __metadata("design:type", Number)
], RepayLoanDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '请选择回款账户' }),
    __metadata("design:type", String)
], RepayLoanDto.prototype, "bankAccountId", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['cash', 'bank'], { message: '还款方式不合法' }),
    __metadata("design:type", String)
], RepayLoanDto.prototype, "repayMethod", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)({}, { message: '还款日期格式不正确' }),
    __metadata("design:type", String)
], RepayLoanDto.prototype, "repayDate", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], RepayLoanDto.prototype, "remark", void 0);
/** 驳回 DTO */
class RejectLoanDto {
    reason;
}
exports.RejectLoanDto = RejectLoanDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '请填写驳回原因' }),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], RejectLoanDto.prototype, "reason", void 0);
