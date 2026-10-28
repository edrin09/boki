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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmployeesImportService = void 0;
const common_1 = require("@nestjs/common");
const hr_entity_1 = require("@core/entities/hr.entity");
const department_entity_1 = require("@core/entities/department.entity");
const code_util_1 = require("@core/common/utils/code.util");
const company_repository_1 = require("@core/common/company/company.repository");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
const employees_service_1 = require("./employees.service");
const sheet_import_util_1 = require("@core/common/utils/sheet-import.util");
/** 花名册列规则（关键词按优先级排列） */
const COLUMN_RULES = [
    { key: 'name', keywords: ['姓名', '员工姓名', '员工', '名字'] },
    { key: 'gender', keywords: ['性别'] },
    { key: 'idCard', keywords: ['身份证号', '身份证', '证件号码', '证件号'] },
    { key: 'phone', keywords: ['手机号', '手机', '电话', '联系方式'] },
    { key: 'department', keywords: ['部门', '所属部门'] },
    { key: 'position', keywords: ['岗位', '职位'] },
    { key: 'employmentType', keywords: ['用工性质', '用工类型', '全职兼职', '雇佣类型', '员工类型'] },
    { key: 'bankName', keywords: ['开户银行', '开户行', '银行名称'] },
    { key: 'bankAccount', keywords: ['工资卡号', '银行卡号', '卡号', '账号'] },
    { key: 'hireDate', keywords: ['入职日期', '入职时间', '入职'] },
    { key: 'baseSalary', keywords: ['基本工资', '底薪', '月薪'] },
];
/**
 * 员工花名册导入（P18）：
 * 解析 Excel/CSV 花名册生成预览（含已存在/将新增/部门是否自动创建标注），
 * 前端确认后按行建档：部门按名称匹配、不存在则自动创建（编码后端生成），工号自动生成。
 */
let EmployeesImportService = class EmployeesImportService {
    employeeRepo;
    deptRepo;
    employeesService;
    constructor(employeeRepo, deptRepo, employeesService) {
        this.employeeRepo = employeeRepo;
        this.deptRepo = deptRepo;
        this.employeesService = employeesService;
    }
    async parseFile(buffer, originalName) {
        const grid = (0, sheet_import_util_1.readSheetGrid)(buffer, originalName);
        if (!grid.length)
            throw new common_1.BadRequestException('文件内容为空');
        const headerIndex = (0, sheet_import_util_1.findHeaderRow)(grid, ['姓名'], ['部门', '身份证', '手机', '岗位']);
        if (headerIndex < 0) {
            throw new common_1.BadRequestException('未识别到花名册表头（需含「姓名」列，建议包含部门/身份证号/手机号等）');
        }
        const colMap = (0, sheet_import_util_1.mapColumns)(grid[headerIndex], COLUMN_RULES);
        if (colMap.name === undefined)
            throw new common_1.BadRequestException('表头缺少「姓名」列');
        const departments = await this.deptRepo.find();
        const deptByName = new Map(departments.map((d) => [d.name.trim(), d]));
        const rows = [];
        const seen = new Set();
        for (let i = headerIndex + 1; i < grid.length; i++) {
            const line = grid[i] ?? [];
            const name = (0, sheet_import_util_1.cellText)(line[colMap.name]);
            if (!name || (0, sheet_import_util_1.isSummaryRow)(name))
                continue;
            const idCard = (0, sheet_import_util_1.cellText)(line[colMap.idCard !== undefined ? colMap.idCard : -1]);
            const phone = (0, sheet_import_util_1.cellText)(line[colMap.phone !== undefined ? colMap.phone : -1]);
            const departmentName = colMap.department !== undefined ? (0, sheet_import_util_1.cellText)(line[colMap.department]) : '';
            const genderLabel = colMap.gender !== undefined ? (0, sheet_import_util_1.cellText)(line[colMap.gender]) : '';
            const baseSalary = colMap.baseSalary !== undefined ? (0, sheet_import_util_1.toNum)(line[colMap.baseSalary]) : 0;
            const messages = [];
            // 与文件内前序行判重
            const dedupeKey = idCard || name;
            if (seen.has(dedupeKey))
                messages.push('文件内重复，导入时将跳过');
            seen.add(dedupeKey);
            // 档案匹配：优先身份证号，其次姓名
            const existing = await this.matchExisting(name, idCard);
            if (existing)
                messages.push('档案已存在，导入时将跳过');
            // 部门匹配
            let departmentWillCreate = false;
            if (departmentName && !deptByName.has(departmentName.trim())) {
                departmentWillCreate = true;
                messages.push(`部门「${departmentName.trim()}」不存在，确认导入时自动创建`);
            }
            const gender = this.mapGender(genderLabel);
            if (genderLabel && !gender)
                messages.push(`性别「${genderLabel}」无法识别，按未知处理`);
            const employmentTypeLabel = colMap.employmentType !== undefined ? (0, sheet_import_util_1.cellText)(line[colMap.employmentType]) : '';
            const employmentType = this.mapEmploymentType(employmentTypeLabel);
            if (employmentTypeLabel && !employmentType) {
                messages.push(`用工性质「${employmentTypeLabel}」无法识别，按全职处理`);
            }
            rows.push({
                rowIndex: i + 1,
                name: name.slice(0, 50),
                gender: gender || 'unknown',
                genderLabel,
                idCard,
                phone,
                departmentName: departmentName.trim(),
                position: colMap.position !== undefined ? (0, sheet_import_util_1.cellText)(line[colMap.position]) : '',
                employmentType: employmentType || '',
                employmentTypeLabel,
                bankName: colMap.bankName !== undefined ? (0, sheet_import_util_1.cellText)(line[colMap.bankName]) : '',
                bankAccount: colMap.bankAccount !== undefined ? (0, sheet_import_util_1.cellText)(line[colMap.bankAccount]) : '',
                hireDate: colMap.hireDate !== undefined ? (0, sheet_import_util_1.excelDateToStr)(line[colMap.hireDate]) : '',
                baseSalary: (0, sheet_import_util_1.round2)(baseSalary),
                exists: !!existing,
                existingId: existing?.id ?? null,
                departmentWillCreate,
                message: messages.join('；') || undefined,
            });
        }
        const newCount = rows.filter((r) => !r.exists).length;
        return {
            rows,
            summary: {
                total: rows.length,
                exists: rows.length - newCount,
                newCount,
                newDepartments: [...new Set(rows.filter((r) => r.departmentWillCreate).map((r) => r.departmentName))],
            },
        };
    }
    /** 确认导入：部门不存在自动创建，员工复用建档链路（工号后端自动生成） */
    async commit(dto) {
        const results = [];
        for (let index = 0; index < dto.rows.length; index++) {
            const row = dto.rows[index];
            try {
                const existing = await this.matchExisting(row.name, row.idCard ?? '');
                if (existing) {
                    results.push({ index, success: true, skipped: true, id: existing.id, name: row.name, message: '档案已存在，跳过' });
                    continue;
                }
                const departmentId = await this.ensureDepartment(row.departmentName ?? '');
                const saved = await this.employeesService.create({
                    name: row.name,
                    gender: row.gender || 'unknown',
                    employmentType: row.employmentType || 'full_time',
                    departmentId: departmentId ?? undefined,
                    position: row.position || undefined,
                    idCard: row.idCard || undefined,
                    phone: row.phone || undefined,
                    hireDate: row.hireDate || undefined,
                    baseSalary: row.baseSalary ?? 0,
                    bankName: row.bankName || undefined,
                    bankAccount: row.bankAccount || undefined,
                });
                results.push({ index, success: true, id: saved.id, code: saved.code, name: saved.name });
            }
            catch (err) {
                results.push({ index, success: false, name: row.name, message: err.message });
            }
        }
        const created = results.filter((r) => r.success && !r.skipped).length;
        const skipped = results.filter((r) => r.skipped).length;
        return { created, skipped, failed: results.length - created - skipped, results };
    }
    // ==================== 内部 ====================
    async matchExisting(name, idCard) {
        if (idCard) {
            const byId = await this.employeeRepo.findOne({ where: { idCard } });
            if (byId)
                return byId;
        }
        return this.employeeRepo.findOne({ where: { name } });
    }
    mapGender(label) {
        if (!label)
            return '';
        if (/^男$|^男性$/.test(label))
            return 'male';
        if (/^女$|^女性$/.test(label))
            return 'female';
        return '';
    }
    /** 用工性质映射：全职/兼职（兼容「临时工」「非全日制」归入兼职） */
    mapEmploymentType(label) {
        if (!label)
            return '';
        if (/全职|正式/.test(label))
            return 'full_time';
        if (/兼职|临时|非全日制|小时工|劳务/.test(label))
            return 'part_time';
        return '';
    }
    /** 按名称取部门，不存在则自动创建（编码后端生成 D####） */
    async ensureDepartment(name) {
        if (!name)
            return null;
        const found = await this.deptRepo.findOne({ where: { name } });
        if (found)
            return found.id;
        const code = await (0, code_util_1.nextCode)(this.deptRepo, code_util_1.CODE_PREFIX.department);
        const created = await this.deptRepo.save(this.deptRepo.create({ code, name, status: 1 }));
        return created.id;
    }
};
exports.EmployeesImportService = EmployeesImportService;
exports.EmployeesImportService = EmployeesImportService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, company_repo_decorator_1.InjectCompanyRepo)(hr_entity_1.Employee)),
    __param(1, (0, company_repo_decorator_1.InjectCompanyRepo)(department_entity_1.Department)),
    __metadata("design:paramtypes", [company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        employees_service_1.EmployeesService])
], EmployeesImportService);
