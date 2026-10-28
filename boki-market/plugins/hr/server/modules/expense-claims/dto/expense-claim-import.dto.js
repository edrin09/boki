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
exports.CommitClaimsImportDto = exports.ImportClaimRowDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
/** 导入报销单明细行（前端确认后提交） */
class ImportClaimRowDto {
    /** 模板单号（可选；为空或重复时后端自动生成） */
    claimNo;
    employeeId;
    employeeName;
    claimDate;
    amount;
    payMethod;
    summary;
}
exports.ImportClaimRowDto = ImportClaimRowDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(30),
    __metadata("design:type", String)
], ImportClaimRowDto.prototype, "claimNo", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '请选择报销人' }),
    __metadata("design:type", String)
], ImportClaimRowDto.prototype, "employeeId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(50),
    __metadata("design:type", String)
], ImportClaimRowDto.prototype, "employeeName", void 0);
__decorate([
    (0, class_validator_1.IsDateString)({}, { message: '报销日期格式不正确' }),
    __metadata("design:type", String)
], ImportClaimRowDto.prototype, "claimDate", void 0);
__decorate([
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 2 }, { message: '报销金额最多两位小数' }),
    (0, class_validator_1.Min)(0.01, { message: '报销金额必须大于 0' }),
    __metadata("design:type", Number)
], ImportClaimRowDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['advance', 'cash', 'bank'], { message: '支付方式不合法' }),
    __metadata("design:type", String)
], ImportClaimRowDto.prototype, "payMethod", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], ImportClaimRowDto.prototype, "summary", void 0);
/** 提交导入：生成报销单草稿（单明细行，费用科目默认管理费用） */
class CommitClaimsImportDto {
    rows;
}
exports.CommitClaimsImportDto = CommitClaimsImportDto;
__decorate([
    (0, class_validator_1.IsArray)({ message: '请至少导入一张报销单' }),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(500, { message: '单次导入最多 500 条' }),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => ImportClaimRowDto),
    __metadata("design:type", Array)
], CommitClaimsImportDto.prototype, "rows", void 0);
