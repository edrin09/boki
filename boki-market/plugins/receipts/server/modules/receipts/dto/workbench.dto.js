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
exports.ToggleRuleDto = exports.SaveClassifyRuleDto = exports.ConfirmBatchDto = exports.UpdateReceiptDto = exports.RejectReceiptDto = exports.UpdateDraftDto = exports.UpdateDraftEntryDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
/** 待确认工作台：修改草稿分录 DTO（改科目/改金额） */
class UpdateDraftEntryDto {
    summary;
    accountId;
    partnerId;
    departmentId;
    projectId;
    /** 员工辅助核算（其他应收款-员工 抵充借款分录必带，丢失会导致核销回写失败） */
    employeeId;
    debit;
    credit;
}
exports.UpdateDraftEntryDto = UpdateDraftEntryDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], UpdateDraftEntryDto.prototype, "summary", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '请选择会计科目' }),
    __metadata("design:type", String)
], UpdateDraftEntryDto.prototype, "accountId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateDraftEntryDto.prototype, "partnerId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateDraftEntryDto.prototype, "departmentId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateDraftEntryDto.prototype, "projectId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateDraftEntryDto.prototype, "employeeId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 2 }),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], UpdateDraftEntryDto.prototype, "debit", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 2 }),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], UpdateDraftEntryDto.prototype, "credit", void 0);
class UpdateDraftDto {
    voucherDate;
    entries;
}
exports.UpdateDraftDto = UpdateDraftDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateDraftDto.prototype, "voucherDate", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(2, { message: '凭证分录不足两条' }),
    (0, class_validator_1.ArrayMaxSize)(20),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => UpdateDraftEntryDto),
    __metadata("design:type", Array)
], UpdateDraftDto.prototype, "entries", void 0);
/** 驳回票据 DTO */
class RejectReceiptDto {
    reason;
}
exports.RejectReceiptDto = RejectReceiptDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], RejectReceiptDto.prototype, "reason", void 0);
/** 修正识别结果 DTO（票据类型 / 进销项方向），仅未入账票据可修正 */
class UpdateReceiptDto {
    receiptType;
    direction;
}
exports.UpdateReceiptDto = UpdateReceiptDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateReceiptDto.prototype, "receiptType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['input', 'output'], { message: '方向只能是 input（进项）或 output（销项）' }),
    __metadata("design:type", String)
], UpdateReceiptDto.prototype, "direction", void 0);
/** 批量确认 DTO */
class ConfirmBatchDto {
    ids;
}
exports.ConfirmBatchDto = ConfirmBatchDto;
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(100),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], ConfirmBatchDto.prototype, "ids", void 0);
/** 归类规则 DTO */
class SaveClassifyRuleDto {
    ruleName;
    matchType;
    matchValue;
    kind;
    targetAccountCode;
    priority;
    enabled;
}
exports.SaveClassifyRuleDto = SaveClassifyRuleDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '请填写规则名称' }),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], SaveClassifyRuleDto.prototype, "ruleName", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['keyword', 'partner'], { message: '匹配方式不合法' }),
    __metadata("design:type", String)
], SaveClassifyRuleDto.prototype, "matchType", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '请填写匹配值（关键词或交易对手名称）' }),
    (0, class_validator_1.MaxLength)(300),
    __metadata("design:type", String)
], SaveClassifyRuleDto.prototype, "matchValue", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['expense', 'income'], { message: '凭证模板类型不合法' }),
    __metadata("design:type", String)
], SaveClassifyRuleDto.prototype, "kind", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '请填写目标科目编码' }),
    (0, class_validator_1.MaxLength)(20),
    __metadata("design:type", String)
], SaveClassifyRuleDto.prototype, "targetAccountCode", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], SaveClassifyRuleDto.prototype, "priority", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)([0, 1]),
    __metadata("design:type", Number)
], SaveClassifyRuleDto.prototype, "enabled", void 0);
/** 规则启停 DTO */
class ToggleRuleDto {
    enabled;
}
exports.ToggleRuleDto = ToggleRuleDto;
__decorate([
    (0, class_validator_1.IsIn)([0, 1]),
    __metadata("design:type", Number)
], ToggleRuleDto.prototype, "enabled", void 0);
