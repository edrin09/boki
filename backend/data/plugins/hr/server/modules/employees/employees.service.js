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
exports.EmployeesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const hr_entity_1 = require("@core/entities/hr.entity");
const department_entity_1 = require("@core/entities/department.entity");
const enums_1 = require("@core/common/enums");
const code_util_1 = require("@core/common/utils/code.util");
const money_util_1 = require("@core/common/utils/money.util");
const company_repository_1 = require("@core/common/company/company.repository");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
const employee_settlement_service_1 = require("../loans/employee-settlement.service");
let EmployeesService = class EmployeesService {
    repo;
    deptRepo;
    claimRepo;
    payrollItemRepo;
    loanRepo;
    settlementService;
    constructor(repo, deptRepo, claimRepo, payrollItemRepo, loanRepo, settlementService) {
        this.repo = repo;
        this.deptRepo = deptRepo;
        this.claimRepo = claimRepo;
        this.payrollItemRepo = payrollItemRepo;
        this.loanRepo = loanRepo;
        this.settlementService = settlementService;
    }
    async findAll(query) {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        const qb = this.repo
            .createQueryBuilder('e')
            .leftJoin('Department', 'd', 'd.id = e.departmentId')
            .addSelect('d.name', 'dept_name');
        if (query.keyword) {
            qb.andWhere(new typeorm_1.Brackets((w) => {
                w.where('e.code LIKE :kw', { kw: `%${query.keyword}%` })
                    .orWhere('e.name LIKE :kw', { kw: `%${query.keyword}%` })
                    .orWhere('e.phone LIKE :kw', { kw: `%${query.keyword}%` })
                    .orWhere('e.position LIKE :kw', { kw: `%${query.keyword}%` });
            }));
        }
        if (query.status !== undefined && query.status !== null && query.status !== '') {
            qb.andWhere('e.status = :status', { status: query.status });
        }
        if (query.departmentId) {
            qb.andWhere('e.departmentId = :departmentId', { departmentId: query.departmentId });
        }
        const [list, total] = await qb
            .orderBy('e.code', 'ASC')
            .skip((page - 1) * pageSize)
            .take(pageSize)
            .getManyAndCount();
        const deptNames = await this.loadDeptNames();
        // 当前欠款余额（仅已发放借款单），一次查出本页员工的余额避免逐行查询
        const balances = await this.settlementService.outstandingMapByEmployees(list.map((e) => e.id));
        return {
            list: list.map((e) => this.toVo(e, deptNames, balances.get(e.id) ?? 0)),
            total,
            page,
            pageSize,
        };
    }
    /** 在职员工下拉选项 */
    async findOptions(onlyOnJob = true) {
        const list = await this.repo.find({ order: { code: 'ASC' } });
        return list
            .filter((e) => (onlyOnJob ? e.status === enums_1.EmployeeStatus.ON_JOB : true))
            .map((e) => ({ id: e.id, code: e.code, name: e.name, departmentId: e.departmentId }));
    }
    async findOne(id) {
        const employee = await this.repo.findOne({ where: { id } });
        if (!employee)
            throw new common_1.NotFoundException('员工不存在');
        const deptNames = await this.loadDeptNames();
        const balances = await this.settlementService.outstandingMapByEmployees([id]);
        return this.toVo(employee, deptNames, balances.get(id) ?? 0);
    }
    /**
     * 员工欠款明细：借款单列表 + 核销流水 + 汇总。
     * 已清偿金额拆分为「现金/银行还款」与「报销等非现金抵充」，欠款余额 = 借款总额 - 两者之和。
     */
    async findDebts(id) {
        const employee = await this.repo.findOne({ where: { id } });
        if (!employee)
            throw new common_1.NotFoundException('员工不存在');
        // 借款单：包含已还清的，便于追溯；待审核/已驳回尚未出账不计欠款
        const loans = await this.loanRepo.find({
            where: { employeeId: id },
            order: { loanDate: 'DESC', createdAt: 'DESC' },
        });
        const loanRows = loans.map((l) => {
            const outstandingCents = [enums_1.LoanStatus.APPROVED, enums_1.LoanStatus.REPAID].includes(l.status)
                ? Math.max(0, (0, money_util_1.toCents)(Number(l.amount)) - (0, money_util_1.toCents)(Number(l.repaidAmount ?? 0)) - (0, money_util_1.toCents)(Number(l.offsetAmount ?? 0)))
                : 0;
            return {
                id: l.id,
                loanNo: l.loanNo,
                loanDate: l.loanDate,
                amount: l.amount,
                repaidAmount: l.repaidAmount ?? 0,
                offsetAmount: l.offsetAmount ?? 0,
                outstanding: outstandingCents / 100,
                status: l.status,
                reason: l.reason,
            };
        });
        // 核销流水：每笔还款/抵充（还了多少钱、走的什么途径）
        const settlementsPage = await this.settlementService.settlements({
            page: 1,
            pageSize: 500,
            employeeId: id,
        });
        const summary = loanRows.reduce((acc, l) => {
            acc.loanTotal = Math.round((acc.loanTotal + Number(l.amount)) * 100) / 100;
            acc.repaidTotal = Math.round((acc.repaidTotal + Number(l.repaidAmount)) * 100) / 100;
            acc.offsetTotal = Math.round((acc.offsetTotal + Number(l.offsetAmount)) * 100) / 100;
            acc.balance = Math.round((acc.balance + Number(l.outstanding)) * 100) / 100;
            return acc;
        }, { loanTotal: 0, repaidTotal: 0, offsetTotal: 0, balance: 0 });
        return {
            employee: { id: employee.id, code: employee.code, name: employee.name, status: employee.status },
            loans: loanRows,
            settlements: settlementsPage.list,
            summary,
        };
    }
    /** 预览下一个可用工号 */
    async getNextCode() {
        return (0, code_util_1.nextCode)(this.repo, code_util_1.CODE_PREFIX.employee);
    }
    async create(dto) {
        const code = (dto.code ?? '').trim() || (await this.getNextCode());
        const exists = await this.repo.findOne({ where: { code } });
        if (exists)
            throw new common_1.ConflictException(`工号「${code}」已存在`);
        if (dto.departmentId)
            await this.assertDeptExists(dto.departmentId);
        const entity = this.repo.create({
            code,
            name: dto.name,
            gender: dto.gender ?? 'unknown',
            employmentType: dto.employmentType ?? 'full_time',
            departmentId: dto.departmentId || null,
            position: dto.position ?? null,
            idCard: dto.idCard ?? null,
            phone: dto.phone ?? null,
            email: dto.email ?? null,
            hireDate: dto.hireDate ?? null,
            leaveDate: null,
            baseSalary: dto.baseSalary ?? 0,
            bankName: dto.bankName ?? null,
            bankAccount: dto.bankAccount ?? null,
            status: dto.status ?? enums_1.EmployeeStatus.ON_JOB,
            remark: dto.remark ?? null,
        });
        const saved = await this.repo.save(entity);
        const deptNames = await this.loadDeptNames();
        return this.toVo(saved, deptNames);
    }
    /** 批量新增：逐条独立入库，返回每条结果（部分失败不影响其他行） */
    async createBatch(items) {
        const results = [];
        for (let index = 0; index < items.length; index++) {
            const dto = items[index];
            try {
                const saved = await this.create(dto);
                results.push({ index, success: true, id: saved.id, code: saved.code, name: saved.name });
            }
            catch (err) {
                results.push({ index, success: false, name: dto.name, message: err.message });
            }
        }
        const created = results.filter((r) => r.success).length;
        return { created, failed: results.length - created, results };
    }
    async update(id, dto) {
        const employee = await this.findEntity(id);
        if (dto.departmentId)
            await this.assertDeptExists(dto.departmentId);
        // 办理离职前必须结清欠款：有未还清借款（或工资扣回未登记完）不允许离职
        if (dto.status !== undefined &&
            dto.status !== employee.status &&
            dto.status === enums_1.EmployeeStatus.LEFT) {
            await this.assertNoOutstanding(employee);
        }
        if (dto.name !== undefined)
            employee.name = dto.name;
        if (dto.gender !== undefined)
            employee.gender = dto.gender;
        if (dto.employmentType !== undefined)
            employee.employmentType = dto.employmentType;
        if (dto.departmentId !== undefined)
            employee.departmentId = dto.departmentId || null;
        if (dto.position !== undefined)
            employee.position = dto.position || null;
        if (dto.idCard !== undefined)
            employee.idCard = dto.idCard || null;
        if (dto.phone !== undefined)
            employee.phone = dto.phone || null;
        if (dto.email !== undefined)
            employee.email = dto.email || null;
        if (dto.hireDate !== undefined)
            employee.hireDate = dto.hireDate || null;
        if (dto.leaveDate !== undefined)
            employee.leaveDate = dto.leaveDate || null;
        if (dto.baseSalary !== undefined)
            employee.baseSalary = dto.baseSalary;
        if (dto.bankName !== undefined)
            employee.bankName = dto.bankName || null;
        if (dto.bankAccount !== undefined)
            employee.bankAccount = dto.bankAccount || null;
        if (dto.status !== undefined)
            employee.status = dto.status;
        if (dto.remark !== undefined)
            employee.remark = dto.remark || null;
        const saved = await this.repo.save(employee);
        const deptNames = await this.loadDeptNames();
        return this.toVo(saved, deptNames);
    }
    async remove(id) {
        const employee = await this.findEntity(id);
        await this.assertNoOutstanding(employee);
        const usedClaim = await this.claimRepo.count({ where: { employeeId: id } });
        if (usedClaim > 0) {
            throw new common_1.ConflictException(`该员工存在 ${usedClaim} 张报销单，无法删除。可改为「离职」`);
        }
        const usedPayroll = await this.payrollItemRepo.count({ where: { employeeId: id } });
        if (usedPayroll > 0) {
            throw new common_1.ConflictException(`该员工存在 ${usedPayroll} 条工资记录，无法删除。可改为「离职」`);
        }
        await this.repo.delete({ id });
        return { message: '删除成功' };
    }
    // ==================== 内部 ====================
    async findEntity(id) {
        const employee = await this.repo.findOne({ where: { id } });
        if (!employee)
            throw new common_1.NotFoundException('员工不存在');
        return employee;
    }
    async assertDeptExists(departmentId) {
        const exists = await this.deptRepo.findOne({ where: { id: departmentId } });
        if (!exists)
            throw new common_1.NotFoundException('部门不存在');
    }
    async loadDeptNames() {
        const depts = await this.deptRepo.find();
        return new Map(depts.map((d) => [d.id, d.name]));
    }
    /** 校验员工无未还清欠款（办理离职 / 删除档案前调用） */
    async assertNoOutstanding(employee) {
        const balances = await this.settlementService.outstandingMapByEmployees([employee.id]);
        const balance = balances.get(employee.id) ?? 0;
        if (balance > 0) {
            throw new common_1.ConflictException(`员工「${employee.name}」尚有未还清借款 ${balance.toFixed(2)} 元，须先还款、报销抵充或工资扣回结清后才能办理`);
        }
    }
    toVo(employee, deptNames, loanBalance = 0) {
        return {
            id: employee.id,
            code: employee.code,
            name: employee.name,
            gender: employee.gender,
            employmentType: employee.employmentType ?? 'full_time',
            departmentId: employee.departmentId,
            departmentName: employee.departmentId ? (deptNames.get(employee.departmentId) ?? null) : null,
            position: employee.position,
            idCard: employee.idCard,
            phone: employee.phone,
            email: employee.email,
            hireDate: employee.hireDate,
            leaveDate: employee.leaveDate,
            baseSalary: employee.baseSalary,
            bankName: employee.bankName,
            bankAccount: employee.bankAccount,
            status: employee.status,
            loanBalance,
            remark: employee.remark,
            createdAt: employee.createdAt,
        };
    }
};
exports.EmployeesService = EmployeesService;
exports.EmployeesService = EmployeesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, company_repo_decorator_1.InjectCompanyRepo)(hr_entity_1.Employee)),
    __param(1, (0, company_repo_decorator_1.InjectCompanyRepo)(department_entity_1.Department)),
    __param(2, (0, company_repo_decorator_1.InjectCompanyRepo)(hr_entity_1.ExpenseClaim)),
    __param(3, (0, company_repo_decorator_1.InjectCompanyRepo)(hr_entity_1.PayrollItem)),
    __param(4, (0, company_repo_decorator_1.InjectCompanyRepo)(hr_entity_1.Loan)),
    __metadata("design:paramtypes", [company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        employee_settlement_service_1.EmployeeSettlementService])
], EmployeesService);
