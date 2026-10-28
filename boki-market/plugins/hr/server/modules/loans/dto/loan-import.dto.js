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
exports.CommitLoansImportDto = exports.ImportLoanRowDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
/** 导入借款单明细行（前端确认后提交） */
class ImportLoanRowDto {
    /** 模板单号（可选；为空或重复时后端自动生成） */
    loanNo;
    employeeId;
    employeeName;
    loanDate;
    amount;
    reason;
    payMethod;
}
exports.ImportLoanRowDto = ImportLoanRowDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(30),
    __metadata("design:type", String)
], ImportLoanRowDto.prototype, "loanNo", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '请选择借款人' }),
    __metadata("design:type", String)
], ImportLoanRowDto.prototype, "employeeId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(50),
    __metadata("design:type", String)
], ImportLoanRowDto.prototype, "employeeName", void 0);
__decorate([
    (0, class_validator_1.IsDateString)({}, { message: '借款日期格式不正确' }),
    __metadata("design:type", String)
], ImportLoanRowDto.prototype, "loanDate", void 0);
__decorate([
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 2 }, { message: '借款金额最多两位小数' }),
    (0, class_validator_1.Min)(0.01, { message: '借款金额必须大于 0' }),
    __metadata("design:type", Number)
], ImportLoanRowDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], ImportLoanRowDto.prototype, "reason", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['cash', 'bank'], { message: '借款方式不合法' }),
    __metadata("design:type", String)
], ImportLoanRowDto.prototype, "payMethod", void 0);
/** 提交导入：生成借款单草稿 */
class CommitLoansImportDto {
    rows;
}
exports.CommitLoansImportDto = CommitLoansImportDto;
__decorate([
    (0, class_validator_1.IsArray)({ message: '请至少导入一张借款单' }),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(500, { message: '单次导入最多 500 条' }),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => ImportLoanRowDto),
    __metadata("design:type", Array)
], CommitLoansImportDto.prototype, "rows", void 0);
