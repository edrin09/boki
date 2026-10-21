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
exports.SaveCashFlowDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
/** 新增/编辑现金银行单据 DTO */
class SaveCashFlowDto {
    bizType;
    bizDate;
    bankAccountId;
    /** 对方科目：收付款 / 费用报销 / 其他收入必填；转账不填 */
    accountId;
    /** 转账时的转入账户 */
    toBankAccountId;
    partnerId;
    /** 员工辅助核算（对方科目为其他应收款-员工等带员工辅助的科目时必填） */
    employeeId;
    departmentId;
    projectId;
    amount;
    summary;
    remark;
    /** 是否生成后直接审核（默认true） */
    autoApprove;
}
exports.SaveCashFlowDto = SaveCashFlowDto;
__decorate([
    (0, class_validator_1.IsIn)(['receipt', 'payment', 'transfer', 'expense', 'income'], { message: '单据类型不合法' }),
    __metadata("design:type", String)
], SaveCashFlowDto.prototype, "bizType", void 0);
__decorate([
    (0, class_validator_1.IsDateString)({}, { message: '业务日期格式不正确' }),
    __metadata("design:type", String)
], SaveCashFlowDto.prototype, "bizDate", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '请选择资金账户' }),
    __metadata("design:type", String)
], SaveCashFlowDto.prototype, "bankAccountId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SaveCashFlowDto.prototype, "accountId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SaveCashFlowDto.prototype, "toBankAccountId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SaveCashFlowDto.prototype, "partnerId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SaveCashFlowDto.prototype, "employeeId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SaveCashFlowDto.prototype, "departmentId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SaveCashFlowDto.prototype, "projectId", void 0);
__decorate([
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 2 }, { message: '金额最多两位小数' }),
    (0, class_validator_1.Min)(0.01, { message: '金额必须大于 0' }),
    __metadata("design:type", Number)
], SaveCashFlowDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], SaveCashFlowDto.prototype, "summary", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], SaveCashFlowDto.prototype, "remark", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)([true, false, 'true', 'false', 1, 0, '1', '0']),
    __metadata("design:type", Object)
], SaveCashFlowDto.prototype, "autoApprove", void 0);
