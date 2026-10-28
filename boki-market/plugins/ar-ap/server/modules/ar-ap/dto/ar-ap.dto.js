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
exports.QueryArApDto = exports.CreateWriteOffDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
/** 往来核销 DTO */
class CreateWriteOffDto {
    type;
    partnerId;
    bizDate;
    bankAccountId;
    /** 应收/应付科目，缺省使用 1122 / 2202 */
    accountId;
    amount;
    summary;
    remark;
    autoApprove;
}
exports.CreateWriteOffDto = CreateWriteOffDto;
__decorate([
    (0, class_validator_1.IsIn)(['receivable', 'payable'], { message: '核销类型不合法' }),
    __metadata("design:type", String)
], CreateWriteOffDto.prototype, "type", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '请选择往来单位' }),
    __metadata("design:type", String)
], CreateWriteOffDto.prototype, "partnerId", void 0);
__decorate([
    (0, class_validator_1.IsDateString)({}, { message: '核销日期格式不正确' }),
    __metadata("design:type", String)
], CreateWriteOffDto.prototype, "bizDate", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '请选择收付款账户' }),
    __metadata("design:type", String)
], CreateWriteOffDto.prototype, "bankAccountId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateWriteOffDto.prototype, "accountId", void 0);
__decorate([
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 2 }, { message: '金额最多两位小数' }),
    (0, class_validator_1.Min)(0.01, { message: '核销金额必须大于 0' }),
    __metadata("design:type", Number)
], CreateWriteOffDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CreateWriteOffDto.prototype, "summary", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CreateWriteOffDto.prototype, "remark", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)([true, false, 'true', 'false', 1, 0, '1', '0']),
    __metadata("design:type", Object)
], CreateWriteOffDto.prototype, "autoApprove", void 0);
/** 应收应付查询 DTO */
class QueryArApDto {
    endPeriod;
    fiscalYear;
    /** 指定科目；缺省应收=1122，应付=2202 */
    accountCode;
    partnerIds;
    /** 仅显示有余额的往来单位 */
    onlyWithBalance;
}
exports.QueryArApDto = QueryArApDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], QueryArApDto.prototype, "endPeriod", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], QueryArApDto.prototype, "fiscalYear", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueryArApDto.prototype, "accountCode", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(50),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], QueryArApDto.prototype, "partnerIds", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['true', 'false', true, false, 1, 0, '1', '0']),
    __metadata("design:type", Object)
], QueryArApDto.prototype, "onlyWithBalance", void 0);
