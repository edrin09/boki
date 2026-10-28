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
exports.SaveIncomeExpenseDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
/** 新增/编辑其他收支单据 DTO */
class SaveIncomeExpenseDto {
    bizType;
    bizDate;
    /** 收入/费用科目 */
    accountId;
    /** 收付款账户 */
    bankAccountId;
    partnerId;
    departmentId;
    projectId;
    amount;
    summary;
    remark;
    autoApprove;
}
exports.SaveIncomeExpenseDto = SaveIncomeExpenseDto;
__decorate([
    (0, class_validator_1.IsIn)(['income', 'expense'], { message: '类型不合法' }),
    __metadata("design:type", String)
], SaveIncomeExpenseDto.prototype, "bizType", void 0);
__decorate([
    (0, class_validator_1.IsDateString)({}, { message: '业务日期格式不正确' }),
    __metadata("design:type", String)
], SaveIncomeExpenseDto.prototype, "bizDate", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '请选择会计科目' }),
    __metadata("design:type", String)
], SaveIncomeExpenseDto.prototype, "accountId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SaveIncomeExpenseDto.prototype, "bankAccountId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SaveIncomeExpenseDto.prototype, "partnerId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SaveIncomeExpenseDto.prototype, "departmentId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SaveIncomeExpenseDto.prototype, "projectId", void 0);
__decorate([
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 2 }, { message: '金额最多两位小数' }),
    (0, class_validator_1.Min)(0.01, { message: '金额必须大于 0' }),
    __metadata("design:type", Number)
], SaveIncomeExpenseDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], SaveIncomeExpenseDto.prototype, "summary", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], SaveIncomeExpenseDto.prototype, "remark", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)([true, false, 'true', 'false', 1, 0, '1', '0']),
    __metadata("design:type", Object)
], SaveIncomeExpenseDto.prototype, "autoApprove", void 0);
