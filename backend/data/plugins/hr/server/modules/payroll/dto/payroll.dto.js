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
exports.PayPayrollDto = exports.GeneratePayrollDto = exports.SavePayrollDto = exports.PayrollItemDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
/** 工资明细行 DTO */
class PayrollItemDto {
    employeeId;
    baseSalary;
    performance;
    allowance;
    overtime;
    insurancePersonal;
    fundPersonal;
    tax;
    otherDeduct;
    /** 借款扣回（从工资扣回员工借款） */
    loanDeduct;
    remark;
}
exports.PayrollItemDto = PayrollItemDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '请选择员工' }),
    __metadata("design:type", String)
], PayrollItemDto.prototype, "employeeId", void 0);
__decorate([
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 2 }),
    (0, class_validator_1.Min)(0, { message: '基本工资不能为负数' }),
    __metadata("design:type", Number)
], PayrollItemDto.prototype, "baseSalary", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 2 }),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], PayrollItemDto.prototype, "performance", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 2 }),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], PayrollItemDto.prototype, "allowance", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 2 }),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], PayrollItemDto.prototype, "overtime", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 2 }),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], PayrollItemDto.prototype, "insurancePersonal", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 2 }),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], PayrollItemDto.prototype, "fundPersonal", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 2 }),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], PayrollItemDto.prototype, "tax", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 2 }),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], PayrollItemDto.prototype, "otherDeduct", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 2 }),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], PayrollItemDto.prototype, "loanDeduct", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], PayrollItemDto.prototype, "remark", void 0);
/** 生成/保存工资单 DTO */
class SavePayrollDto {
    period;
    payDate;
    /** 费用科目（计提工资用） */
    expenseAccountId;
    /** 应付职工薪酬-工资 */
    payableAccountId;
    /** 其他应付款（代扣社保/公积金） */
    deductAccountId;
    /** 应交税费-应交个人所得税 */
    taxAccountId;
    /** 发放资金账户 */
    bankAccountId;
    items;
    remark;
}
exports.SavePayrollDto = SavePayrollDto;
__decorate([
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)({ message: '工资期间不合法' }),
    (0, class_validator_1.Min)(190001, { message: '工资期间不合法' }),
    __metadata("design:type", Number)
], SavePayrollDto.prototype, "period", void 0);
__decorate([
    (0, class_validator_1.IsDateString)({}, { message: '发放日期格式不正确' }),
    __metadata("design:type", String)
], SavePayrollDto.prototype, "payDate", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SavePayrollDto.prototype, "expenseAccountId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SavePayrollDto.prototype, "payableAccountId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SavePayrollDto.prototype, "deductAccountId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SavePayrollDto.prototype, "taxAccountId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SavePayrollDto.prototype, "bankAccountId", void 0);
__decorate([
    (0, class_validator_1.IsArray)({ message: '请至少录入一名员工的工资' }),
    (0, class_validator_1.ArrayMinSize)(1, { message: '请至少录入一名员工的工资' }),
    (0, class_validator_1.ArrayMaxSize)(500, { message: '单张工资单员工过多' }),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => PayrollItemDto),
    __metadata("design:type", Array)
], SavePayrollDto.prototype, "items", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], SavePayrollDto.prototype, "remark", void 0);
/** 按在职员工生成草稿 DTO */
class GeneratePayrollDto {
    period;
    payDate;
    /** 指定部门（不填则取全部在职员工） */
    departmentId;
}
exports.GeneratePayrollDto = GeneratePayrollDto;
__decorate([
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)({ message: '工资期间不合法' }),
    (0, class_validator_1.Min)(190001, { message: '工资期间不合法' }),
    __metadata("design:type", Number)
], GeneratePayrollDto.prototype, "period", void 0);
__decorate([
    (0, class_validator_1.IsDateString)({}, { message: '发放日期格式不正确' }),
    __metadata("design:type", String)
], GeneratePayrollDto.prototype, "payDate", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GeneratePayrollDto.prototype, "departmentId", void 0);
/** 发放工资 DTO */
class PayPayrollDto {
    bankAccountId;
    payDate;
    remark;
}
exports.PayPayrollDto = PayPayrollDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PayPayrollDto.prototype, "bankAccountId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PayPayrollDto.prototype, "payDate", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], PayPayrollDto.prototype, "remark", void 0);
