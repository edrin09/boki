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
exports.LoansImportService = void 0;
const common_1 = require("@nestjs/common");
const hr_entity_1 = require("@core/entities/hr.entity");
const enums_1 = require("@core/common/enums");
const company_repository_1 = require("@core/common/company/company.repository");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
const loans_service_1 = require("./loans.service");
const sheet_import_util_1 = require("@core/common/utils/sheet-import.util");
/** 借款单列规则 */
const COLUMN_RULES = [
    { key: 'loanNo', keywords: ['单号', '借款单号', '编号'] },
    { key: 'employee', keywords: ['借款人', '员工姓名', '姓名', '员工'] },
    { key: 'department', keywords: ['部门', '所属部门'] },
    { key: 'reason', keywords: ['借款事由', '事由', '用途', '摘要'] },
    { key: 'payMethod', keywords: ['借款方式', '方式', '支付方式'] },
    { key: 'amount', keywords: ['借款金额', '金额', '借款数'] },
    { key: 'status', keywords: ['状态'] },
    { key: 'date', keywords: ['借款日期', '日期', '时间'] },
];
/**
 * 借款单导入（P18）：
 * 解析 Excel/CSV 借款单生成预览（借款人匹配档案、单号/重复校验），
 * 前端确认后按行生成借款单草稿——沿用「导入先进待确认，审核后出账」的约定，
 * 审核时经既有链路生成借款凭证并登记员工往来。
 */
let LoansImportService = class LoansImportService {
    repo;
    employeeRepo;
    loansService;
    constructor(repo, employeeRepo, loansService) {
        this.repo = repo;
        this.employeeRepo = employeeRepo;
        this.loansService = loansService;
    }
    async parseFile(buffer, originalName) {
        const grid = (0, sheet_import_util_1.readSheetGrid)(buffer, originalName);
        if (!grid.length)
            throw new common_1.BadRequestException('文件内容为空');
        const headerIndex = (0, sheet_import_util_1.findHeaderRow)(grid, ['借款人', '姓名'], ['金额', '借款', '日期']);
        if (headerIndex < 0) {
            throw new common_1.BadRequestException('未识别到借款单表头（需含「借款人」与「金额/借款日期」列）');
        }
        const colMap = (0, sheet_import_util_1.mapColumns)(grid[headerIndex], COLUMN_RULES);
        if (colMap.employee === undefined)
            throw new common_1.BadRequestException('表头缺少「借款人」列');
        if (colMap.amount === undefined)
            throw new common_1.BadRequestException('表头缺少「借款金额」列');
        if (colMap.date === undefined)
            throw new common_1.BadRequestException('表头缺少「借款日期」列');
        const rows = await this.rowsFromGrid(grid, headerIndex, colMap);
        const matched = rows.filter((r) => r.matched).length;
        return {
            rows,
            summary: {
                total: rows.length,
                matched,
                unmatched: rows.length - matched,
                unmatchedNames: rows.filter((r) => !r.matched).map((r) => r.employeeName),
                totalAmount: (0, sheet_import_util_1.round2)(rows.reduce((a, r) => a + r.amount, 0)),
                duplicates: rows.filter((r) => r.duplicate).length,
            },
        };
    }
    /** 确认导入：逐行生成借款单草稿（审核后才出账） */
    async commit(dto, operator) {
        const results = [];
        for (let index = 0; index < dto.rows.length; index++) {
            const row = dto.rows[index];
            try {
                const saved = await this.loansService.create({
                    loanNo: row.loanNo || undefined,
                    loanDate: row.loanDate,
                    employeeId: row.employeeId,
                    amount: row.amount,
                    reason: row.reason || undefined,
                    payMethod: row.payMethod,
                }, operator);
                results.push({ index, success: true, id: saved.id, loanNo: saved.loanNo, employeeName: saved.employeeName });
            }
            catch (err) {
                results.push({ index, success: false, employeeName: row.employeeName, message: err.message });
            }
        }
        const created = results.filter((r) => r.success).length;
        return { created, failed: results.length - created, results };
    }
    // ==================== 解析 ====================
    async rowsFromGrid(grid, headerIndex, colMap) {
        const employees = await this.employeeRepo.find();
        const byName = employees.filter((e) => e.status === 1);
        const rows = [];
        const noSeen = new Map();
        for (let i = headerIndex + 1; i < grid.length; i++) {
            const line = grid[i] ?? [];
            const employeeName = colMap.employee !== undefined ? (0, sheet_import_util_1.cellText)(line[colMap.employee]) : '';
            const amount = (0, sheet_import_util_1.round2)((0, sheet_import_util_1.toNum)(line[colMap.amount]));
            if (!employeeName && amount <= 0)
                continue;
            if (employeeName && (0, sheet_import_util_1.isSummaryRow)(employeeName))
                continue;
            const loanNo = colMap.loanNo !== undefined ? (0, sheet_import_util_1.cellText)(line[colMap.loanNo]) : '';
            const loanDate = (0, sheet_import_util_1.excelDateToStr)(line[colMap.date]);
            const payMethodLabel = colMap.payMethod !== undefined ? (0, sheet_import_util_1.cellText)(line[colMap.payMethod]) : '';
            const statusLabel = colMap.status !== undefined ? (0, sheet_import_util_1.cellText)(line[colMap.status]) : '';
            const messages = [];
            if (!loanDate)
                messages.push('借款日期无法识别');
            if (amount <= 0)
                messages.push('借款金额必须大于 0');
            // 借款人匹配在职档案
            const employee = byName.find((e) => e.name === employeeName);
            if (!employee)
                messages.push(`未匹配到在职员工档案「${employeeName}」，请手工选择`);
            // 单号校验：文件内重复 / 库中已占用
            let loanNoTaken = false;
            if (loanNo) {
                if (noSeen.has(loanNo))
                    messages.push('单号在文件内重复，导入时将自动生成新单号');
                else
                    noSeen.set(loanNo, i);
                const existsInDb = await this.repo.findOne({ where: { loanNo } });
                if (existsInDb) {
                    loanNoTaken = true;
                    messages.push('单号已存在，导入时将自动生成新单号');
                }
            }
            // 疑似重复：同人同日同金额
            let duplicate = false;
            if (employee && loanDate && amount > 0) {
                const dup = await this.repo.findOne({
                    where: { employeeId: employee.id, loanDate, amount: amount },
                });
                if (dup && dup.status !== enums_1.LoanStatus.REJECTED) {
                    duplicate = true;
                    messages.push(`与已有借款单 ${dup.loanNo} 同人同日同金额，请确认是否重复导入`);
                }
            }
            rows.push({
                rowIndex: i + 1,
                loanNo: loanNoTaken ? '' : loanNo,
                loanNoTaken,
                loanDate,
                employeeName: employeeName.slice(0, 50),
                matched: !!employee,
                employeeId: employee?.id ?? null,
                departmentName: colMap.department !== undefined ? (0, sheet_import_util_1.cellText)(line[colMap.department]) : '',
                reason: colMap.reason !== undefined ? (0, sheet_import_util_1.cellText)(line[colMap.reason]) : '',
                payMethod: this.mapPayMethod(payMethodLabel),
                payMethodLabel,
                amount,
                statusLabel,
                duplicate,
                message: messages.join('；') || undefined,
            });
        }
        return rows;
    }
    /** 借款方式：银行转账/银行→bank，现金→cash，默认 bank */
    mapPayMethod(label) {
        if (/现金/.test(label))
            return 'cash';
        return 'bank';
    }
};
exports.LoansImportService = LoansImportService;
exports.LoansImportService = LoansImportService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, company_repo_decorator_1.InjectCompanyRepo)(hr_entity_1.Loan)),
    __param(1, (0, company_repo_decorator_1.InjectCompanyRepo)(hr_entity_1.Employee)),
    __metadata("design:paramtypes", [company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        loans_service_1.LoansService])
], LoansImportService);
