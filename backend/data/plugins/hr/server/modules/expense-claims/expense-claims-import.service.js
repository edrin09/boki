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
exports.ExpenseClaimsImportService = void 0;
const common_1 = require("@nestjs/common");
const hr_entity_1 = require("@core/entities/hr.entity");
const enums_1 = require("@core/common/enums");
const company_repository_1 = require("@core/common/company/company.repository");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
const expense_claims_service_1 = require("./expense-claims.service");
const sheet_import_util_1 = require("@core/common/utils/sheet-import.util");
/** 报销单列规则 */
const COLUMN_RULES = [
    { key: 'claimNo', keywords: ['单号', '报销单号', '编号'] },
    { key: 'employee', keywords: ['报销人', '员工姓名', '姓名', '员工'] },
    { key: 'department', keywords: ['部门', '所属部门'] },
    { key: 'payMethod', keywords: ['支付方式', '付款方式', '方式'] },
    { key: 'amount', keywords: ['金额合计', '合计金额', '报销金额', '金额'] },
    { key: 'summary', keywords: ['费用说明', '事由', '摘要', '用途', '备注'] },
    { key: 'status', keywords: ['状态'] },
    { key: 'date', keywords: ['报销日期', '日期', '时间'] },
];
/**
 * 报销单导入（P18）：
 * 解析 Excel/CSV 报销单生成预览（报销人匹配档案、支付方式映射、单号/重复校验），
 * 前端确认后按行生成报销单草稿（单明细行，费用科目落库时默认取管理费用 6602），
 * 审核后经既有链路生成费用凭证；员工垫付方式审核时自动挂「其他应收款-员工」。
 */
let ExpenseClaimsImportService = class ExpenseClaimsImportService {
    repo;
    employeeRepo;
    claimsService;
    constructor(repo, employeeRepo, claimsService) {
        this.repo = repo;
        this.employeeRepo = employeeRepo;
        this.claimsService = claimsService;
    }
    async parseFile(buffer, originalName) {
        const grid = (0, sheet_import_util_1.readSheetGrid)(buffer, originalName);
        if (!grid.length)
            throw new common_1.BadRequestException('文件内容为空');
        const headerIndex = (0, sheet_import_util_1.findHeaderRow)(grid, ['报销人', '姓名'], ['金额', '报销', '日期']);
        if (headerIndex < 0) {
            throw new common_1.BadRequestException('未识别到报销单表头（需含「报销人」与「金额/报销日期」列）');
        }
        const colMap = (0, sheet_import_util_1.mapColumns)(grid[headerIndex], COLUMN_RULES);
        if (colMap.employee === undefined)
            throw new common_1.BadRequestException('表头缺少「报销人」列');
        if (colMap.amount === undefined)
            throw new common_1.BadRequestException('表头缺少「金额合计」列');
        if (colMap.date === undefined)
            throw new common_1.BadRequestException('表头缺少「报销日期」列');
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
    /** 确认导入：逐行生成报销单草稿（审核后才出账） */
    async commit(dto, operator) {
        const results = [];
        for (let index = 0; index < dto.rows.length; index++) {
            const row = dto.rows[index];
            try {
                const saved = await this.claimsService.create({
                    claimNo: row.claimNo || undefined,
                    claimDate: row.claimDate,
                    employeeId: row.employeeId,
                    payMethod: row.payMethod,
                    items: [{ summary: row.summary || '报销', amount: row.amount }],
                    remark: '报销单导入',
                }, operator);
                results.push({ index, success: true, id: saved.id, claimNo: saved.claimNo, employeeName: saved.employeeName });
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
        const noSeen = new Set();
        for (let i = headerIndex + 1; i < grid.length; i++) {
            const line = grid[i] ?? [];
            const employeeName = colMap.employee !== undefined ? (0, sheet_import_util_1.cellText)(line[colMap.employee]) : '';
            const amount = (0, sheet_import_util_1.round2)((0, sheet_import_util_1.toNum)(line[colMap.amount]));
            if (!employeeName && amount <= 0)
                continue;
            if (employeeName && (0, sheet_import_util_1.isSummaryRow)(employeeName))
                continue;
            const claimNo = colMap.claimNo !== undefined ? (0, sheet_import_util_1.cellText)(line[colMap.claimNo]) : '';
            const claimDate = (0, sheet_import_util_1.excelDateToStr)(line[colMap.date]);
            const payMethodLabel = colMap.payMethod !== undefined ? (0, sheet_import_util_1.cellText)(line[colMap.payMethod]) : '';
            const statusLabel = colMap.status !== undefined ? (0, sheet_import_util_1.cellText)(line[colMap.status]) : '';
            const messages = [];
            if (!claimDate)
                messages.push('报销日期无法识别');
            if (amount <= 0)
                messages.push('报销金额必须大于 0');
            // 报销人匹配在职档案
            const employee = byName.find((e) => e.name === employeeName);
            if (!employee)
                messages.push(`未匹配到在职员工档案「${employeeName}」，请手工选择`);
            // 单号校验
            let claimNoTaken = false;
            if (claimNo) {
                if (noSeen.has(claimNo))
                    messages.push('单号在文件内重复，导入时将自动生成新单号');
                else
                    noSeen.add(claimNo);
                const existsInDb = await this.repo.findOne({ where: { claimNo } });
                if (existsInDb) {
                    claimNoTaken = true;
                    messages.push('单号已存在，导入时将自动生成新单号');
                }
            }
            // 疑似重复：同人同日同金额
            let duplicate = false;
            if (employee && claimDate && amount > 0) {
                const dup = await this.repo.findOne({
                    where: { employeeId: employee.id, claimDate, totalAmount: amount },
                });
                if (dup && dup.status !== enums_1.ExpenseClaimStatus.REJECTED) {
                    duplicate = true;
                    messages.push(`与已有报销单 ${dup.claimNo} 同人同日同金额，请确认是否重复导入`);
                }
            }
            rows.push({
                rowIndex: i + 1,
                claimNo: claimNoTaken ? '' : claimNo,
                claimNoTaken,
                claimDate,
                employeeName: employeeName.slice(0, 50),
                matched: !!employee,
                employeeId: employee?.id ?? null,
                departmentName: colMap.department !== undefined ? (0, sheet_import_util_1.cellText)(line[colMap.department]) : '',
                payMethod: this.mapPayMethod(payMethodLabel),
                payMethodLabel,
                amount,
                summary: colMap.summary !== undefined ? (0, sheet_import_util_1.cellText)(line[colMap.summary]) : '',
                statusLabel,
                duplicate,
                message: messages.join('；') || undefined,
            });
        }
        return rows;
    }
    /** 支付方式：现金→cash，银行→bank，垫付/挂账→advance，默认 advance（员工垫付） */
    mapPayMethod(label) {
        if (/现金/.test(label))
            return 'cash';
        if (/银行|转账/.test(label))
            return 'bank';
        return 'advance';
    }
};
exports.ExpenseClaimsImportService = ExpenseClaimsImportService;
exports.ExpenseClaimsImportService = ExpenseClaimsImportService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, company_repo_decorator_1.InjectCompanyRepo)(hr_entity_1.ExpenseClaim)),
    __param(1, (0, company_repo_decorator_1.InjectCompanyRepo)(hr_entity_1.Employee)),
    __metadata("design:paramtypes", [company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        expense_claims_service_1.ExpenseClaimsService])
], ExpenseClaimsImportService);
