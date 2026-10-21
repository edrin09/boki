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
exports.SetCompanyMemberDto = exports.AddCompanyMemberDto = exports.SwitchCompanyDto = exports.UpdateCompanyDto = exports.CreateCompanyDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
/** 新建公司 */
class CreateCompanyDto {
    name;
    code;
    /** 纳税人识别号：新建时必填 —— 用于比对票面购销方、判定进项/销项方向 */ /** 纳税人识别号：新建时必填 —— 用于比对票面购销方、判定进项/销项方向 */
    taxNo;
    /** 纳税人类型：新建时必须选择 —— 决定增值税记账口径（小规模纳税人进项不可抵扣） */
    taxpayerType;
    vatRate;
    taxDeclareCycle;
    autoPostThreshold;
    autoPostEnabled;
    legalPerson;
    industry;
    address;
    bankName;
    bankAccount;
    fiscalStartMonth;
    remark;
    /** 是否同时把当前用户加入该公司（默认加入，创建者） */
    joinCurrentUser;
    /** 复制当前公司的会计科目作为初始科目表（默认开启） */
    copyAccountsFromCurrent;
}
exports.CreateCompanyDto = CreateCompanyDto;
__decorate([
    (0, class_validator_1.IsString)({ message: '公司名称不能为空' }),
    (0, class_validator_1.Length)(1, 100, { message: '公司名称长度 1-100' }),
    __metadata("design:type", String)
], CreateCompanyDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(1, 30, { message: '公司编码长度 1-30' }),
    __metadata("design:type", String)
], CreateCompanyDto.prototype, "code", void 0);
__decorate([
    (0, class_validator_1.IsString)({ message: '请填写纳税人识别号' }),
    (0, class_validator_1.Length)(1, 50, { message: '纳税人识别号长度 1-50' }),
    __metadata("design:type", String)
], CreateCompanyDto.prototype, "taxNo", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['small_scale', 'general'], { message: '纳税人类型只能是 small_scale 或 general' }),
    __metadata("design:type", String)
], CreateCompanyDto.prototype, "taxpayerType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({}, { message: '增值税征收率必须是数字' }),
    (0, class_validator_1.Min)(0, { message: '增值税征收率不能为负' }),
    (0, class_validator_1.Max)(100, { message: '增值税征收率不能超过 100' }),
    __metadata("design:type", Number)
], CreateCompanyDto.prototype, "vatRate", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['month', 'quarter'], { message: '申报周期只能是 month 或 quarter' }),
    __metadata("design:type", String)
], CreateCompanyDto.prototype, "taxDeclareCycle", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({}, { message: '自动记账阈值必须是数字' }),
    (0, class_validator_1.Min)(0, { message: '阈值不能小于 0' }),
    (0, class_validator_1.Max)(1, { message: '阈值不能大于 1' }),
    __metadata("design:type", Number)
], CreateCompanyDto.prototype, "autoPostThreshold", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.IsIn)([0, 1], { message: '自动记账开关只能是 0 或 1' }),
    __metadata("design:type", Number)
], CreateCompanyDto.prototype, "autoPostEnabled", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(1, 50),
    __metadata("design:type", String)
], CreateCompanyDto.prototype, "legalPerson", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(1, 50),
    __metadata("design:type", String)
], CreateCompanyDto.prototype, "industry", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CreateCompanyDto.prototype, "address", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], CreateCompanyDto.prototype, "bankName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(50),
    __metadata("design:type", String)
], CreateCompanyDto.prototype, "bankAccount", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(12),
    __metadata("design:type", Number)
], CreateCompanyDto.prototype, "fiscalStartMonth", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CreateCompanyDto.prototype, "remark", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreateCompanyDto.prototype, "joinCurrentUser", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreateCompanyDto.prototype, "copyAccountsFromCurrent", void 0);
/** 编辑公司 */
class UpdateCompanyDto {
    name;
    code;
    taxNo;
    taxpayerType;
    vatRate;
    taxDeclareCycle;
    autoPostThreshold;
    autoPostEnabled;
    legalPerson;
    industry;
    address;
    bankName;
    bankAccount;
    fiscalStartMonth;
    status;
    remark;
}
exports.UpdateCompanyDto = UpdateCompanyDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(1, 100),
    __metadata("design:type", String)
], UpdateCompanyDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(1, 30),
    __metadata("design:type", String)
], UpdateCompanyDto.prototype, "code", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(50),
    __metadata("design:type", String)
], UpdateCompanyDto.prototype, "taxNo", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['small_scale', 'general'], { message: '纳税人类型只能是 small_scale 或 general' }),
    __metadata("design:type", String)
], UpdateCompanyDto.prototype, "taxpayerType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({}, { message: '增值税征收率必须是数字' }),
    (0, class_validator_1.Min)(0, { message: '增值税征收率不能为负' }),
    (0, class_validator_1.Max)(100, { message: '增值税征收率不能超过 100' }),
    __metadata("design:type", Number)
], UpdateCompanyDto.prototype, "vatRate", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['month', 'quarter'], { message: '申报周期只能是 month 或 quarter' }),
    __metadata("design:type", String)
], UpdateCompanyDto.prototype, "taxDeclareCycle", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)({}, { message: '自动记账阈值必须是数字' }),
    (0, class_validator_1.Min)(0, { message: '阈值不能小于 0' }),
    (0, class_validator_1.Max)(1, { message: '阈值不能大于 1' }),
    __metadata("design:type", Number)
], UpdateCompanyDto.prototype, "autoPostThreshold", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.IsIn)([0, 1], { message: '自动记账开关只能是 0 或 1' }),
    __metadata("design:type", Number)
], UpdateCompanyDto.prototype, "autoPostEnabled", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(50),
    __metadata("design:type", String)
], UpdateCompanyDto.prototype, "legalPerson", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(50),
    __metadata("design:type", String)
], UpdateCompanyDto.prototype, "industry", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], UpdateCompanyDto.prototype, "address", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], UpdateCompanyDto.prototype, "bankName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(50),
    __metadata("design:type", String)
], UpdateCompanyDto.prototype, "bankAccount", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(12),
    __metadata("design:type", Number)
], UpdateCompanyDto.prototype, "fiscalStartMonth", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsIn)([0, 1]),
    __metadata("design:type", Number)
], UpdateCompanyDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], UpdateCompanyDto.prototype, "remark", void 0);
/** 切换公司 */
class SwitchCompanyDto {
    companyId;
}
exports.SwitchCompanyDto = SwitchCompanyDto;
__decorate([
    (0, class_validator_1.IsString)({ message: '请选择公司' }),
    __metadata("design:type", String)
], SwitchCompanyDto.prototype, "companyId", void 0);
/** 成员授权 */
class AddCompanyMemberDto {
    userIds;
}
exports.AddCompanyMemberDto = AddCompanyMemberDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(200),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], AddCompanyMemberDto.prototype, "userIds", void 0);
/** 授权时可同时指定角色 */
class SetCompanyMemberDto {
    userIds;
    roleIds;
}
exports.SetCompanyMemberDto = SetCompanyMemberDto;
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(200),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], SetCompanyMemberDto.prototype, "userIds", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(50),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], SetCompanyMemberDto.prototype, "roleIds", void 0);
