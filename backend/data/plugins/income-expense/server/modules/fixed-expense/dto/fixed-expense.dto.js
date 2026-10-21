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
exports.SaveFixedExpenseDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
/** 新增/编辑固定费用模板 DTO */
class SaveFixedExpenseDto {
    name;
    frequency;
    amount;
    /** 费用科目 */
    accountId;
    /** 支付账户，空则默认现金科目 */
    bankAccountId;
    partnerId;
    departmentId;
    projectId;
    bizDay;
    startDate;
    endDate;
    autoApprove;
    status;
    remark;
}
exports.SaveFixedExpenseDto = SaveFixedExpenseDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '请填写费用名称' }),
    (0, class_validator_1.MaxLength)(100, { message: '费用名称最多 100 字' }),
    __metadata("design:type", String)
], SaveFixedExpenseDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['once', 'monthly', 'quarterly', 'yearly'], { message: '频率不合法' }),
    __metadata("design:type", String)
], SaveFixedExpenseDto.prototype, "frequency", void 0);
__decorate([
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 2 }, { message: '金额最多两位小数' }),
    (0, class_validator_1.Min)(0.01, { message: '金额必须大于 0' }),
    __metadata("design:type", Number)
], SaveFixedExpenseDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '请选择费用科目' }),
    __metadata("design:type", String)
], SaveFixedExpenseDto.prototype, "accountId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SaveFixedExpenseDto.prototype, "bankAccountId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SaveFixedExpenseDto.prototype, "partnerId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SaveFixedExpenseDto.prototype, "departmentId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SaveFixedExpenseDto.prototype, "projectId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1, { message: '扣费日最小为 1' }),
    (0, class_validator_1.Max)(31, { message: '扣费日最大为 31' }),
    __metadata("design:type", Number)
], SaveFixedExpenseDto.prototype, "bizDay", void 0);
__decorate([
    (0, class_validator_1.IsDateString)({}, { message: '生效起始日格式不正确' }),
    __metadata("design:type", String)
], SaveFixedExpenseDto.prototype, "startDate", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)({}, { message: '失效日期格式不正确' }),
    __metadata("design:type", String)
], SaveFixedExpenseDto.prototype, "endDate", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)([true, false, 'true', 'false', 1, 0, '1', '0']),
    __metadata("design:type", Object)
], SaveFixedExpenseDto.prototype, "autoApprove", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsIn)([0, 1], { message: '状态不合法' }),
    __metadata("design:type", Number)
], SaveFixedExpenseDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], SaveFixedExpenseDto.prototype, "remark", void 0);
