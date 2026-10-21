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
exports.CommitEmployeesImportDto = exports.ImportEmployeeRowDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
/** 导入花名册明细行（前端确认后提交） */
class ImportEmployeeRowDto {
    name;
    gender;
    /** 用工性质：full_time 全职 / part_time 兼职 */
    employmentType;
    /** 部门名称（导入时按名称匹配，不存在自动创建） */
    departmentName;
    position;
    idCard;
    phone;
    hireDate;
    baseSalary;
    bankName;
    bankAccount;
}
exports.ImportEmployeeRowDto = ImportEmployeeRowDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.MaxLength)(50),
    __metadata("design:type", String)
], ImportEmployeeRowDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['male', 'female', 'unknown']),
    __metadata("design:type", String)
], ImportEmployeeRowDto.prototype, "gender", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['full_time', 'part_time'], { message: '用工性质只能是全职或兼职' }),
    __metadata("design:type", String)
], ImportEmployeeRowDto.prototype, "employmentType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], ImportEmployeeRowDto.prototype, "departmentName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(50),
    __metadata("design:type", String)
], ImportEmployeeRowDto.prototype, "position", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(30),
    __metadata("design:type", String)
], ImportEmployeeRowDto.prototype, "idCard", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(30),
    __metadata("design:type", String)
], ImportEmployeeRowDto.prototype, "phone", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)({}, { message: '入职日期格式不正确' }),
    __metadata("design:type", String)
], ImportEmployeeRowDto.prototype, "hireDate", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 2 }, { message: '基本工资最多两位小数' }),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], ImportEmployeeRowDto.prototype, "baseSalary", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], ImportEmployeeRowDto.prototype, "bankName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(50),
    __metadata("design:type", String)
], ImportEmployeeRowDto.prototype, "bankAccount", void 0);
/** 提交导入花名册 */
class CommitEmployeesImportDto {
    rows;
}
exports.CommitEmployeesImportDto = CommitEmployeesImportDto;
__decorate([
    (0, class_validator_1.IsArray)({ message: '请至少提供一条员工数据' }),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(500, { message: '单次导入最多 500 条' }),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => ImportEmployeeRowDto),
    __metadata("design:type", Array)
], CommitEmployeesImportDto.prototype, "rows", void 0);
