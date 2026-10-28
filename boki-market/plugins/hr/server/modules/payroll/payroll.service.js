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
exports.PayrollService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const hr_entity_1 = require("@core/entities/hr.entity");
const department_entity_1 = require("@core/entities/department.entity");
const account_entity_1 = require("@core/entities/account.entity");
const bank_account_entity_1 = require("@core/entities/bank-account.entity");
const voucher_entity_1 = require("@core/entities/voucher.entity");
const enums_1 = require("@core/common/enums");
const money_util_1 = require("@core/common/utils/money.util");
const company_repository_1 = require("@core/common/company/company.repository");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
const vouchers_service_1 = require("@core/modules/vouchers/vouchers.service");
const employee_settlement_service_1 = require("../loans/employee-settlement.service");
/** 默认科目编码 */
const DEFAULT_EXPENSE_CODE = '6602'; // 管理费用（工资费用）
const DEFAULT_PAYABLE_CODE = '2211.01'; // 应付职工薪酬-工资
const DEFAULT_DEDUCT_CODE = '2241'; // 其他应付款（代扣社保/公积金）
const DEFAULT_TAX_CODE = '2221.04'; // 应交税费-应交个人所得税
const DEFAULT_RECEIVABLE_CODE = '1221'; // 其他应收款-员工借款（工资扣回用）
const DEFAULT_BANK_CODE = '1002'; // 银行存款
let PayrollService = class PayrollService {
    repo;
    itemRepo;
    employeeRepo;
    deptRepo;
    accountRepo;
    bankRepo;
    voucherRepo;
    vouchersService;
    settlementService;
    constructor(repo, itemRepo, employeeRepo, deptRepo, accountRepo, bankRepo, voucherRepo, vouchersService, settlementService) {
        this.repo = repo;
        this.itemRepo = itemRepo;
        this.employeeRepo = employeeRepo;
        this.deptRepo = deptRepo;
        this.accountRepo = accountRepo;
        this.bankRepo = bankRepo;
        this.voucherRepo = voucherRepo;
        this.vouchersService = vouchersService;
        this.settlementService = settlementService;
    }
    // ==================== 查询 ====================
    async findAll(query) {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        const qb = this.repo.createQueryBuilder('p');
        if (query.status)
            qb.andWhere('p.status = :status', { status: query.status });
        if (query.startPeriod && query.endPeriod) {
            qb.andWhere('p.period BETWEEN :s AND :e', { s: query.startPeriod, e: query.endPeriod });
        }
        if (query.keyword) {
            qb.andWhere('p.payrollNo LIKE :kw', { kw: `%${query.keyword}%` });
        }
        const [list, total] = await qb
            .orderBy('p.period', 'DESC')
            .addOrderBy('p.createdAt', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize)
            .getManyAndCount();
        return { list: list.map((p) => this.toVo(p, [])), total, page, pageSize };
    }
    async findOne(id) {
        const payroll = await this.repo.findOne({ where: { id } });
        if (!payroll)
            throw new common_1.NotFoundException('工资单不存在');
        const items = await this.itemRepo.find({ where: { payrollId: id }, order: { sort: 'ASC' } });
        return this.toVo(payroll, items);
    }
    /**
     * 批量导出 PDF（原始凭证存根）用：按 ids 或筛选条件取工资单+明细，最多 300 张
     */
    async findForPdfExport(dto) {
        const MAX = 300;
        let payrolls;
        if (dto.ids?.length) {
            payrolls = await this.repo.find({ where: { id: (0, typeorm_1.In)(dto.ids.slice(0, MAX)) } });
        }
        else {
            const qb = this.repo.createQueryBuilder('p');
            if (dto.status)
                qb.andWhere('p.status = :status', { status: dto.status });
            if (dto.startPeriod && dto.endPeriod) {
                qb.andWhere('p.period BETWEEN :s AND :e', { s: dto.startPeriod, e: dto.endPeriod });
            }
            else if (dto.startPeriod) {
                qb.andWhere('p.period >= :s', { s: dto.startPeriod });
            }
            else if (dto.endPeriod) {
                qb.andWhere('p.period <= :e', { e: dto.endPeriod });
            }
            payrolls = await qb.orderBy('p.period', 'ASC').take(MAX).getMany();
        }
        if (!payrolls.length)
            return [];
        const items = await this.itemRepo.find({ where: { payrollId: (0, typeorm_1.In)(payrolls.map((p) => p.id)) } });
        const byPayroll = new Map();
        for (const it of items) {
            const arr = byPayroll.get(it.payrollId) ?? [];
            arr.push(it);
            byPayroll.set(it.payrollId, arr);
        }
        for (const arr of byPayroll.values())
            arr.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
        return payrolls.map((payroll) => ({ payroll, items: byPayroll.get(payroll.id) ?? [] }));
    }
    // ==================== 生成 ====================
    /** 按在职员工生成工资单草稿 */
    async generate(dto, operator) {
        const exists = await this.repo.findOne({ where: { period: dto.period } });
        if (exists) {
            throw new common_1.BadRequestException(`${dto.period} 期间已存在工资单（${exists.payrollNo}），请直接编辑或先删除`);
        }
        const qb = this.employeeRepo
            .createQueryBuilder('e')
            .where('e.status = :status', { status: enums_1.EmployeeStatus.ON_JOB });
        if (dto.departmentId) {
            qb.andWhere('e.departmentId = :departmentId', { departmentId: dto.departmentId });
        }
        const employees = await qb.orderBy('e.code', 'ASC').getMany();
        if (!employees.length) {
            throw new common_1.BadRequestException('没有符合条件的在职员工');
        }
        const deptNames = await this.loadDeptNames();
        const payrollNo = await this.getNextPayrollNo(dto.period);
        // 自动带出员工欠款：有未还清借款的员工按余额预填「借款扣回」，
        // 欠款超过应发工资时按应发封顶（代扣合计不允许超过应发）
        const outstandingMap = await this.settlementService.outstandingMapByEmployees(employees.map((e) => e.id));
        const entity = this.repo.create({
            payrollNo,
            period: dto.period,
            payDate: dto.payDate.slice(0, 10),
            employeeCount: employees.length,
            status: enums_1.PayrollStatus.DRAFT,
            remark: null,
            createdBy: operator.id,
            createdByName: operator.nickname,
        });
        const saved = await this.repo.save(entity);
        const items = employees.map((e, index) => this.buildItemRow(saved.id, e, deptNames, index, outstandingMap.get(e.id) ?? 0));
        await this.itemRepo.save(items);
        await this.recalcTotals(saved.id);
        return this.findOne(saved.id);
    }
    /** 保存工资单（含明细） */
    async save(dto, operator, id) {
        const contexts = await this.resolveContexts(dto);
        const target = id ? await this.findEntity(id) : null;
        if (target && target.status !== enums_1.PayrollStatus.DRAFT) {
            throw new common_1.BadRequestException('仅草稿状态的工资单可以编辑');
        }
        if (!target) {
            const dup = await this.repo.findOne({ where: { period: dto.period } });
            if (dup) {
                throw new common_1.BadRequestException(`${dto.period} 期间已存在工资单，请直接编辑`);
            }
        }
        const totals = this.sumItems(contexts.items);
        const payroll = target ?? this.repo.create({ payrollNo: await this.getNextPayrollNo(dto.period) });
        payroll.period = dto.period;
        payroll.payDate = dto.payDate.slice(0, 10);
        payroll.employeeCount = contexts.items.length;
        payroll.totalGross = totals.gross;
        payroll.totalInsurance = totals.insurance;
        payroll.totalFund = totals.fund;
        payroll.totalTax = totals.tax;
        payroll.totalOtherDeduct = totals.otherDeduct;
        payroll.totalLoanDeduct = totals.loanDeduct;
        payroll.totalNet = totals.net;
        payroll.remark = dto.remark ?? null;
        payroll.createdBy = operator.id;
        payroll.createdByName = operator.nickname;
        payroll.expenseAccountId = contexts.expenseAccount?.id ?? null;
        payroll.expenseAccountName = contexts.expenseAccount?.name ?? null;
        payroll.payableAccountId = contexts.payableAccount?.id ?? null;
        payroll.payableAccountName = contexts.payableAccount?.name ?? null;
        payroll.deductAccountId = contexts.deductAccount?.id ?? null;
        payroll.deductAccountName = contexts.deductAccount?.name ?? null;
        payroll.taxAccountId = contexts.taxAccount?.id ?? null;
        payroll.taxAccountName = contexts.taxAccount?.name ?? null;
        payroll.bankAccountId = contexts.bankAccount?.id ?? null;
        payroll.bankAccountName = contexts.bankAccount?.name ?? null;
        const saved = await this.repo.save(payroll);
        await this.itemRepo.delete({ payrollId: saved.id });
        const rows = contexts.items.map((item) => this.itemRepo.create({ ...item, payrollId: saved.id }));
        await this.itemRepo.save(rows);
        return this.findOne(saved.id);
    }
    async update(id, dto, operator) {
        return this.save(dto, operator, id);
    }
    // ==================== 审核 / 发放 ====================
    /** 审核：计提工资费用（借 费用科目 贷 应付职工薪酬-工资） */
    async approve(id, operator) {
        const payroll = await this.findEntity(id);
        if (payroll.status !== enums_1.PayrollStatus.DRAFT) {
            throw new common_1.BadRequestException('仅草稿状态的工资单可以审核');
        }
        const items = await this.itemRepo.find({ where: { payrollId: id } });
        if (!items.length)
            throw new common_1.BadRequestException('工资单没有员工明细');
        const expense = await this.requireAccount(payroll.expenseAccountId ?? undefined, DEFAULT_EXPENSE_CODE, '工资费用科目');
        const payable = await this.requireAccount(payroll.payableAccountId ?? undefined, DEFAULT_PAYABLE_CODE, '应付职工薪酬科目');
        const totalGross = this.sumRaw(items.map((i) => Number(i.gross)));
        const voucher = await this.vouchersService.createFromSystem({
            word: enums_1.VoucherWord.GENERAl,
            voucherDate: payroll.payDate,
            entries: [
                { summary: `计提${payroll.payrollNo}工资`, accountId: expense.id, debit: totalGross },
                { summary: `计提${payroll.payrollNo}工资`, accountId: payable.id, credit: totalGross },
            ],
            remark: `工资单 ${payroll.payrollNo} 计提`,
            sourceType: enums_1.VoucherSource.PAYROLL,
            sourceId: id,
            autoApprove: true,
        }, operator);
        payroll.status = enums_1.PayrollStatus.APPROVED;
        payroll.voucherId = voucher.id;
        payroll.approvedAt = new Date();
        await this.repo.save(payroll);
        return this.findOne(id);
    }
    /** 发放：借 应付职工薪酬-工资 贷 银行/代扣项 */
    async pay(id, dto, operator) {
        const payroll = await this.findEntity(id);
        if (payroll.status !== enums_1.PayrollStatus.APPROVED) {
            throw new common_1.BadRequestException('仅已审核的工资单可以发放');
        }
        const items = await this.itemRepo.find({ where: { payrollId: id } });
        if (!items.length)
            throw new common_1.BadRequestException('工资单没有员工明细');
        const totals = {
            insurance: this.sumRaw(items.map((i) => Number(i.insurancePersonal))),
            fund: this.sumRaw(items.map((i) => Number(i.fundPersonal))),
            tax: this.sumRaw(items.map((i) => Number(i.tax))),
            other: this.sumRaw(items.map((i) => Number(i.otherDeduct))),
            loanDeduct: this.sumRaw(items.map((i) => Number(i.loanDeduct ?? 0))),
            net: this.sumRaw(items.map((i) => Number(i.net))),
        };
        const payable = await this.requireAccount(payroll.payableAccountId ?? undefined, DEFAULT_PAYABLE_CODE, '应付职工薪酬科目');
        // 未指定发放账户时回退到默认银行存款科目，不强制先建资金账户档案
        const bankAccount = await this.resolvePayAccount(dto.bankAccountId ?? payroll.bankAccountId);
        const summary = `发放${payroll.payrollNo}工资`;
        const entries = [
            { summary, accountId: payable.id, debit: this.sumRaw(items.map((i) => Number(i.gross))) },
            { summary, accountId: bankAccount.id, credit: totals.net },
        ];
        // 代扣项合并成一笔，挂其他应付款
        const deductCents = (0, money_util_1.toCents)(totals.insurance) + (0, money_util_1.toCents)(totals.fund) + (0, money_util_1.toCents)(totals.other);
        if (deductCents > 0) {
            const deduct = await this.requireAccount(payroll.deductAccountId ?? undefined, DEFAULT_DEDUCT_CODE, '代扣款项挂账科目');
            entries.push({ summary: `${summary}-代扣`, accountId: deduct.id, credit: (0, money_util_1.fromCents)(deductCents) });
        }
        if ((0, money_util_1.toCents)(totals.tax) > 0) {
            const tax = await this.requireAccount(payroll.taxAccountId ?? undefined, DEFAULT_TAX_CODE, '个税科目');
            entries.push({ summary: `${summary}-个税`, accountId: tax.id, credit: totals.tax });
        }
        // 借款扣回：贷「其他应收款-员工」，按员工拆分辅助核算
        const loanItems = items.filter((i) => (0, money_util_1.toCents)(Number(i.loanDeduct ?? 0)) > 0);
        if (loanItems.length) {
            const receivable = await this.requireAccount(undefined, DEFAULT_RECEIVABLE_CODE, '其他应收款科目');
            for (const i of loanItems) {
                entries.push({
                    summary: `${summary}-扣回借款`,
                    accountId: receivable.id,
                    employeeId: i.employeeId,
                    credit: Number(i.loanDeduct ?? 0),
                });
            }
        }
        const voucher = await this.vouchersService.createFromSystem({
            word: enums_1.VoucherWord.GENERAl,
            voucherDate: dto.payDate ?? payroll.payDate,
            entries,
            remark: dto.remark ?? `工资单 ${payroll.payrollNo} 发放`,
            sourceType: enums_1.VoucherSource.PAYROLL,
            sourceId: id,
            autoApprove: true,
        }, operator);
        payroll.status = enums_1.PayrollStatus.PAID;
        payroll.payVoucherId = voucher.id;
        payroll.paidAt = new Date();
        payroll.bankAccountId = dto.bankAccountId ?? payroll.bankAccountId ?? null;
        payroll.bankAccountName = bankAccount.name;
        await this.repo.save(payroll);
        // 工资扣回借款：凭证已贷 1221，这里补登记核销流水并按 FIFO 回写借款单已清偿金额
        // （员工有多张未还清借款单时按借款日期先后自动分配）
        const settleDate = String(dto.payDate ?? payroll.payDate ?? '').slice(0, 10);
        for (const i of loanItems) {
            try {
                await this.settlementService.registerExisting({
                    settleType: 'payroll',
                    sourceId: id,
                    sourceNo: payroll.payrollNo,
                    employeeId: i.employeeId,
                    amount: Number(i.loanDeduct ?? 0),
                    settleDate,
                    summary: `${i.employeeName} 工资扣回借款`,
                    voucherId: voucher.id,
                    remark: `工资单 ${payroll.payrollNo} 扣回借款`,
                }, operator);
            }
            catch (err) {
                // 核销登记失败不阻断发放（凭证已出账），但要把原因带出来人工核对
                throw new common_1.BadRequestException(`工资已发放，但员工「${i.employeeName}」借款核销登记失败：${err.message}`);
            }
        }
        return this.findOne(id);
    }
    async remove(id) {
        const payroll = await this.findEntity(id);
        if (payroll.status === enums_1.PayrollStatus.PAID) {
            throw new common_1.BadRequestException('已发放的工资单不可删除');
        }
        if (payroll.voucherId) {
            const voucher = await this.voucherRepo.findOne({ where: { id: payroll.voucherId } });
            if (voucher) {
                if (voucher.status === enums_1.VoucherStatus.APPROVED) {
                    await this.vouchersService.unapprove(voucher.id);
                }
                await this.vouchersService.remove(voucher.id);
            }
        }
        await this.itemRepo.delete({ payrollId: id });
        await this.repo.delete({ id });
        return { message: '删除成功' };
    }
    // ==================== 内部 ====================
    async findEntity(id) {
        const payroll = await this.repo.findOne({ where: { id } });
        if (!payroll)
            throw new common_1.NotFoundException('工资单不存在');
        return payroll;
    }
    async getNextPayrollNo(period) {
        const prefix = `GZ${period}`;
        const max = await this.repo
            .createQueryBuilder('p')
            .select('MAX(p.payrollNo)', 'max')
            .where('p.payrollNo LIKE :prefix', { prefix: `${prefix}%` })
            .getRawOne();
        const last = max?.max ?? `${prefix}01`;
        const seq = parseInt(last.slice(prefix.length), 10) + 1 || 1;
        return `${prefix}${String(seq).padStart(2, '0')}`;
    }
    buildItemRow(payrollId, employee, deptNames, index, outstanding) {
        const base = Number(employee.baseSalary ?? 0);
        // 生成时自动扣除员工欠款：扣回金额 = min(欠款余额, 应发工资)
        const loanDeduct = Math.min(Math.max(outstanding, 0), base);
        return this.itemRepo.create({
            payrollId,
            employeeId: employee.id,
            employeeCode: employee.code,
            employeeName: employee.name,
            departmentName: employee.departmentId ? (deptNames.get(employee.departmentId) ?? null) : null,
            baseSalary: base,
            performance: 0,
            allowance: 0,
            overtime: 0,
            gross: base,
            insurancePersonal: 0,
            fundPersonal: 0,
            tax: 0,
            otherDeduct: 0,
            loanDeduct,
            net: (0, money_util_1.fromCents)((0, money_util_1.toCents)(base) - (0, money_util_1.toCents)(loanDeduct)),
            remark: null,
            sort: index + 1,
        });
    }
    async resolveContexts(dto) {
        const employeeIds = dto.items.map((i) => i.employeeId);
        const uniqueIds = Array.from(new Set(employeeIds));
        if (uniqueIds.length !== employeeIds.length) {
            throw new common_1.BadRequestException('存在重复的员工，请检查');
        }
        const employees = await this.employeeRepo.find({ where: { id: (0, typeorm_1.In)(uniqueIds) } });
        const employeeMap = new Map(employees.map((e) => [e.id, e]));
        const missing = employeeIds.filter((id) => !employeeMap.has(id));
        if (missing.length)
            throw new common_1.BadRequestException('存在无效的员工');
        const deptNames = await this.loadDeptNames();
        const items = [];
        for (let index = 0; index < dto.items.length; index++) {
            const item = dto.items[index];
            const employee = employeeMap.get(item.employeeId);
            const employeeName = employee.name;
            const base = (0, money_util_1.toCents)(item.baseSalary);
            const performance = (0, money_util_1.toCents)(item.performance ?? 0);
            const allowance = (0, money_util_1.toCents)(item.allowance ?? 0);
            const overtime = (0, money_util_1.toCents)(item.overtime ?? 0);
            const insurance = (0, money_util_1.toCents)(item.insurancePersonal ?? 0);
            const fund = (0, money_util_1.toCents)(item.fundPersonal ?? 0);
            const tax = (0, money_util_1.toCents)(item.tax ?? 0);
            const other = (0, money_util_1.toCents)(item.otherDeduct ?? 0);
            const loanDeduct = (0, money_util_1.toCents)(item.loanDeduct ?? 0);
            const grossCents = base + performance + allowance + overtime;
            const deductCents = insurance + fund + tax + other + loanDeduct;
            if (deductCents > grossCents) {
                throw new common_1.BadRequestException(`员工「${employeeName}」的代扣合计（${(0, money_util_1.fromCents)(deductCents)}）超过应发工资（${(0, money_util_1.fromCents)(grossCents)}）`);
            }
            items.push({
                payrollId: '',
                employeeId: employee.id,
                employeeCode: employee.code,
                employeeName,
                departmentName: employee.departmentId
                    ? (deptNames.get(employee.departmentId) ?? null)
                    : null,
                baseSalary: (0, money_util_1.fromCents)(base),
                performance: (0, money_util_1.fromCents)(performance),
                allowance: (0, money_util_1.fromCents)(allowance),
                overtime: (0, money_util_1.fromCents)(overtime),
                gross: (0, money_util_1.fromCents)(grossCents),
                insurancePersonal: (0, money_util_1.fromCents)(insurance),
                fundPersonal: (0, money_util_1.fromCents)(fund),
                tax: (0, money_util_1.fromCents)(tax),
                otherDeduct: (0, money_util_1.fromCents)(other),
                loanDeduct: (0, money_util_1.fromCents)(loanDeduct),
                net: (0, money_util_1.fromCents)(grossCents - deductCents),
                remark: item.remark ?? null,
                sort: index + 1,
            });
        }
        // 科目：仅在需要时校验（存在代扣才需要代扣科目）
        const hasDeduct = items.some((i) => (0, money_util_1.toCents)(i.insurancePersonal) + (0, money_util_1.toCents)(i.fundPersonal) + (0, money_util_1.toCents)(i.otherDeduct) > 0);
        const hasTax = items.some((i) => (0, money_util_1.toCents)(i.tax) > 0);
        const expenseAccount = await this.optionalAccount(dto.expenseAccountId, DEFAULT_EXPENSE_CODE);
        const payableAccount = await this.optionalAccount(dto.payableAccountId, DEFAULT_PAYABLE_CODE);
        const deductAccount = hasDeduct
            ? await this.requireAccount(dto.deductAccountId ?? undefined, DEFAULT_DEDUCT_CODE, '代扣款项挂账科目')
            : await this.optionalAccount(dto.deductAccountId, DEFAULT_DEDUCT_CODE);
        const taxAccount = hasTax
            ? await this.requireAccount(dto.taxAccountId ?? undefined, DEFAULT_TAX_CODE, '个税科目')
            : await this.optionalAccount(dto.taxAccountId, DEFAULT_TAX_CODE);
        let bankAccount = null;
        if (dto.bankAccountId) {
            bankAccount = await this.bankRepo.findOne({ where: { id: dto.bankAccountId } });
            if (!bankAccount)
                throw new common_1.BadRequestException('发放账户不存在');
        }
        return { items, expenseAccount, payableAccount, deductAccount, taxAccount, bankAccount };
    }
    sumItems(items) {
        return {
            gross: this.sumRaw(items.map((i) => i.gross)),
            insurance: this.sumRaw(items.map((i) => i.insurancePersonal)),
            fund: this.sumRaw(items.map((i) => i.fundPersonal)),
            tax: this.sumRaw(items.map((i) => i.tax)),
            otherDeduct: this.sumRaw(items.map((i) => i.otherDeduct)),
            loanDeduct: this.sumRaw(items.map((i) => Number(i.loanDeduct ?? 0))),
            net: this.sumRaw(items.map((i) => i.net)),
        };
    }
    sumRaw(list) {
        return (0, money_util_1.fromCents)(list.reduce((acc, n) => acc + (0, money_util_1.toCents)(n), 0));
    }
    async recalcTotals(payrollId) {
        const items = await this.itemRepo.find({ where: { payrollId } });
        const payroll = await this.findEntity(payrollId);
        const totals = this.sumItems(items);
        payroll.totalGross = totals.gross;
        payroll.totalInsurance = totals.insurance;
        payroll.totalFund = totals.fund;
        payroll.totalTax = totals.tax;
        payroll.totalOtherDeduct = totals.otherDeduct;
        payroll.totalLoanDeduct = totals.loanDeduct;
        payroll.totalNet = totals.net;
        payroll.employeeCount = items.length;
        await this.repo.save(payroll);
    }
    async optionalAccount(id, fallbackCode) {
        if (id) {
            const account = await this.accountRepo.findOne({ where: { id } });
            if (!account)
                throw new common_1.BadRequestException('指定的科目不存在');
            if (!account.isLeaf)
                throw new common_1.BadRequestException(`科目「${account.fullName}」不是明细科目`);
            return account;
        }
        const account = await this.accountRepo.findOne({ where: { code: fallbackCode } });
        return account && account.isLeaf ? account : null;
    }
    async requireAccount(id, fallbackCode, label) {
        if (id) {
            const account = await this.accountRepo.findOne({ where: { id } });
            if (!account)
                throw new common_1.BadRequestException(`${label}不存在`);
            if (!account.isLeaf)
                throw new common_1.BadRequestException(`${label}「${account.fullName}」不是明细科目`);
            if (account.status !== 1)
                throw new common_1.BadRequestException(`${label}「${account.fullName}」已禁用`);
            return account;
        }
        const account = await this.accountRepo.findOne({ where: { code: fallbackCode } });
        if (!account) {
            throw new common_1.BadRequestException(`系统默认${label}「${fallbackCode}」不存在，请在「会计科目」中确认`);
        }
        if (!account.isLeaf)
            throw new common_1.BadRequestException(`系统默认${label}「${fallbackCode}」不是明细科目`);
        return account;
    }
    async resolveBankAccount(bankAccountId) {
        let bank = null;
        if (bankAccountId) {
            bank = await this.bankRepo.findOne({ where: { id: bankAccountId } });
        }
        else {
            bank = await this.bankRepo.findOne({ where: { accountCode: DEFAULT_BANK_CODE, status: 1 } });
        }
        if (!bank)
            throw new common_1.BadRequestException('请选择发放账户，或先在「资金账户」中配置银行存款账户');
        return bank;
    }
    /**
     * 解析发放账户对应的会计科目：
     * 1. 指定了资金账户档案 -> 用其关联科目
     * 2. 未指定 -> 直接回退到默认银行存款科目，避免必须先建档案
     */
    async resolvePayAccount(bankAccountId) {
        if (bankAccountId) {
            const bank = await this.bankRepo.findOne({ where: { id: bankAccountId } });
            if (!bank)
                throw new common_1.BadRequestException('发放账户不存在');
            if (!bank.accountCode) {
                throw new common_1.BadRequestException(`资金账户「${bank.name}」未关联会计科目`);
            }
            const account = await this.accountRepo.findOne({ where: { code: bank.accountCode } });
            if (!account) {
                throw new common_1.BadRequestException(`资金账户「${bank.name}」关联的科目 ${bank.accountCode} 不存在`);
            }
            if (!account.isLeaf) {
                throw new common_1.BadRequestException(`资金账户关联科目「${account.fullName}」不是明细科目`);
            }
            return account;
        }
        return this.requireAccount(undefined, DEFAULT_BANK_CODE, '发放账户对应科目');
    }
    async resolveAccountOfBank(bank) {
        if (!bank.accountCode) {
            throw new common_1.BadRequestException(`资金账户「${bank.name}」未关联会计科目`);
        }
        const account = await this.accountRepo.findOne({ where: { code: bank.accountCode } });
        if (!account) {
            throw new common_1.BadRequestException(`资金账户「${bank.name}」关联的科目 ${bank.accountCode} 不存在`);
        }
        if (!account.isLeaf) {
            throw new common_1.BadRequestException(`资金账户关联科目「${account.fullName}」不是明细科目`);
        }
        return account;
    }
    async loadDeptNames() {
        const depts = await this.deptRepo.find();
        return new Map(depts.map((d) => [d.id, d.name]));
    }
    statusLabel(status) {
        switch (status) {
            case enums_1.PayrollStatus.DRAFT:
                return '草稿';
            case enums_1.PayrollStatus.APPROVED:
                return '已审核';
            case enums_1.PayrollStatus.PAID:
                return '已发放';
            default:
                return status;
        }
    }
    toVo(payroll, items) {
        return {
            id: payroll.id,
            payrollNo: payroll.payrollNo,
            period: payroll.period,
            payDate: payroll.payDate,
            employeeCount: payroll.employeeCount,
            totalGross: payroll.totalGross,
            totalInsurance: payroll.totalInsurance,
            totalFund: payroll.totalFund,
            totalTax: payroll.totalTax,
            totalOtherDeduct: payroll.totalOtherDeduct,
            totalLoanDeduct: payroll.totalLoanDeduct,
            totalNet: payroll.totalNet,
            status: payroll.status,
            statusLabel: this.statusLabel(payroll.status),
            expenseAccountId: payroll.expenseAccountId,
            expenseAccountName: payroll.expenseAccountName,
            payableAccountId: payroll.payableAccountId,
            payableAccountName: payroll.payableAccountName,
            deductAccountId: payroll.deductAccountId,
            deductAccountName: payroll.deductAccountName,
            taxAccountId: payroll.taxAccountId,
            taxAccountName: payroll.taxAccountName,
            bankAccountId: payroll.bankAccountId,
            bankAccountName: payroll.bankAccountName,
            voucherId: payroll.voucherId,
            payVoucherId: payroll.payVoucherId,
            createdByName: payroll.createdByName,
            approvedAt: payroll.approvedAt,
            paidAt: payroll.paidAt,
            remark: payroll.remark,
            createdAt: payroll.createdAt,
            items: items.map((i) => ({
                id: i.id,
                employeeId: i.employeeId,
                employeeCode: i.employeeCode,
                employeeName: i.employeeName,
                departmentName: i.departmentName,
                baseSalary: i.baseSalary,
                performance: i.performance,
                allowance: i.allowance,
                overtime: i.overtime,
                gross: i.gross,
                insurancePersonal: i.insurancePersonal,
                fundPersonal: i.fundPersonal,
                tax: i.tax,
                otherDeduct: i.otherDeduct,
                loanDeduct: i.loanDeduct,
                net: i.net,
                remark: i.remark,
                sort: i.sort,
            })),
        };
    }
    /** 供其他模块检查期间是否有工资单 */
    async countByPeriod(period) {
        return this.repo.count({ where: { period } });
    }
};
exports.PayrollService = PayrollService;
exports.PayrollService = PayrollService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, company_repo_decorator_1.InjectCompanyRepo)(hr_entity_1.Payroll)),
    __param(1, (0, company_repo_decorator_1.InjectCompanyRepo)(hr_entity_1.PayrollItem)),
    __param(2, (0, company_repo_decorator_1.InjectCompanyRepo)(hr_entity_1.Employee)),
    __param(3, (0, company_repo_decorator_1.InjectCompanyRepo)(department_entity_1.Department)),
    __param(4, (0, company_repo_decorator_1.InjectCompanyRepo)(account_entity_1.Account)),
    __param(5, (0, company_repo_decorator_1.InjectCompanyRepo)(bank_account_entity_1.BankAccount)),
    __param(6, (0, company_repo_decorator_1.InjectCompanyRepo)(voucher_entity_1.Voucher)),
    __metadata("design:paramtypes", [company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        vouchers_service_1.VouchersService,
        employee_settlement_service_1.EmployeeSettlementService])
], PayrollService);
