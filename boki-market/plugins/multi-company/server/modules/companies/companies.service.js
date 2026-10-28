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
var CompaniesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompaniesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const company_entity_1 = require("@core/entities/company.entity");
const user_company_entity_1 = require("@core/entities/user-company.entity");
const user_entity_1 = require("@core/entities/user.entity");
const role_entity_1 = require("@core/entities/role.entity");
const account_entity_1 = require("@core/entities/account.entity");
const voucher_entity_1 = require("@core/entities/voucher.entity");
const voucher_entry_entity_1 = require("@core/entities/voucher-entry.entity");
const company_scope_interceptor_1 = require("@core/common/company/company-scope.interceptor");
const company_context_1 = require("@core/common/company/company-context");
const company_constants_1 = require("@core/common/company/company.constants");
const account_seed_1 = require("@core/db/seeds/account.seed");
let CompaniesService = CompaniesService_1 = class CompaniesService {
    companyRepo;
    linkRepo;
    userRepo;
    roleRepo;
    accountRepo;
    voucherRepo;
    entryRepo;
    logger = new common_1.Logger(CompaniesService_1.name);
    constructor(companyRepo, linkRepo, userRepo, roleRepo, accountRepo, voucherRepo, entryRepo) {
        this.companyRepo = companyRepo;
        this.linkRepo = linkRepo;
        this.userRepo = userRepo;
        this.roleRepo = roleRepo;
        this.accountRepo = accountRepo;
        this.voucherRepo = voucherRepo;
        this.entryRepo = entryRepo;
    }
    // ==================== 查询 ====================
    /** 当前用户可访问的公司列表 */
    async findMyCompanies(userId) {
        const links = await this.linkRepo.find({ where: { userId, status: 1 } });
        if (!links.length)
            return [];
        const companies = await this.companyRepo.find({
            where: { id: (0, typeorm_2.In)(links.map((l) => l.companyId)) },
            order: { createdAt: 'ASC' },
        });
        const byId = new Map(companies.map((c) => [c.id, c]));
        return links
            .map((l) => {
            const company = byId.get(l.companyId);
            return company ? this.toVo(company, l) : null;
        })
            .filter(Boolean);
    }
    /** 公司详情（含成员） */
    async findOne(id) {
        const company = await this.getEntity(id);
        const links = await this.linkRepo.find({ where: { companyId: id, status: 1 } });
        const users = links.length
            ? await this.userRepo.find({
                where: { id: (0, typeorm_2.In)(links.map((l) => l.userId)) },
                relations: { roles: true },
            })
            : [];
        const userMap = new Map(users.map((u) => [u.id, u]));
        return {
            ...this.toVo(company),
            members: links
                .map((l) => {
                const u = userMap.get(l.userId);
                if (!u)
                    return null;
                return {
                    linkId: l.id,
                    userId: u.id,
                    username: u.username,
                    nickname: u.nickname,
                    isOwner: l.isOwner,
                    roles: (u.roles ?? []).map((r) => ({ id: r.id, code: r.code, name: r.name })),
                    roleIds: (u.roles ?? []).map((r) => r.id),
                };
            })
                .filter(Boolean),
        };
    }
    /** 公司是否启用 */
    async assertUsable(companyId, userId) {
        const company = await this.getEntity(companyId);
        if (company.status !== 1)
            throw new common_1.ForbiddenException('该公司已停用');
        const link = await this.linkRepo.findOne({
            where: { companyId, userId, status: 1 },
        });
        if (!link)
            throw new common_1.ForbiddenException('您没有该公司的访问权限');
        return company;
    }
    // ==================== 写入 ====================
    /**
     * 新建记账公司。
     *
     * 会计科目按标准模板初始化（或从当前公司复制），
     * 其余基础资料保持为空，由用户按需录入 —— 各公司数据天然隔离。
     */
    async create(dto, operatorId) {
        const code = (dto.code ?? '').trim() || await this.nextCode(dto.name);
        const exists = await this.companyRepo.findOne({ where: { code } });
        if (exists)
            throw new common_1.ConflictException(`公司编码「${code}」已存在`);
        const company = await this.companyRepo.save(this.companyRepo.create({
            code,
            name: dto.name.trim(),
            taxNo: dto.taxNo?.trim() || null,
            taxpayerType: dto.taxpayerType ?? 'small_scale',
            // 一般纳税人按分税率申报，不设单一征收率
            vatRate: dto.taxpayerType === 'general' ? 0 : (dto.vatRate ?? company_constants_1.DEFAULT_SMALL_SCALE_VAT_RATE),
            taxDeclareCycle: dto.taxDeclareCycle ?? 'month',
            autoPostThreshold: dto.autoPostThreshold ?? company_constants_1.DEFAULT_AUTO_POST_THRESHOLD,
            autoPostEnabled: dto.autoPostEnabled ?? 1,
            legalPerson: dto.legalPerson?.trim() || null,
            industry: dto.industry?.trim() || null,
            address: dto.address?.trim() || null,
            bankName: dto.bankName?.trim() || null,
            bankAccount: dto.bankAccount?.trim() || null,
            fiscalStartMonth: dto.fiscalStartMonth ?? 1,
            status: 1,
            remark: dto.remark?.trim() || null,
        }));
        // 新公司内部操作统一以该公司为上下文
        await (0, company_context_1.runWithCompany)({ companyId: company.id, userId: operatorId }, async () => {
            await this.initAccounts(company.id, dto.copyAccountsFromCurrent !== false);
        });
        if (dto.joinCurrentUser !== false) {
            await this.addMembers(company.id, [operatorId], true);
        }
        (0, company_scope_interceptor_1.invalidateCompanyCache)(company.id);
        return company;
    }
    async update(id, dto) {
        const company = await this.getEntity(id);
        if (dto.code && dto.code !== company.code) {
            const dup = await this.companyRepo.findOne({ where: { code: dto.code } });
            if (dup)
                throw new common_1.ConflictException(`公司编码「${dto.code}」已存在`);
            company.code = dto.code;
        }
        if (dto.name !== undefined)
            company.name = dto.name.trim();
        if (dto.taxNo !== undefined)
            company.taxNo = dto.taxNo.trim().toUpperCase() || null;
        if (dto.taxpayerType !== undefined)
            company.taxpayerType = dto.taxpayerType;
        if (dto.vatRate !== undefined)
            company.vatRate = dto.vatRate;
        if (dto.taxDeclareCycle !== undefined)
            company.taxDeclareCycle = dto.taxDeclareCycle;
        if (dto.autoPostThreshold !== undefined)
            company.autoPostThreshold = dto.autoPostThreshold;
        if (dto.autoPostEnabled !== undefined)
            company.autoPostEnabled = dto.autoPostEnabled;
        if (dto.legalPerson !== undefined)
            company.legalPerson = dto.legalPerson.trim() || null;
        if (dto.industry !== undefined)
            company.industry = dto.industry.trim() || null;
        if (dto.address !== undefined)
            company.address = dto.address.trim() || null;
        if (dto.bankName !== undefined)
            company.bankName = dto.bankName.trim() || null;
        if (dto.bankAccount !== undefined)
            company.bankAccount = dto.bankAccount.trim() || null;
        if (dto.fiscalStartMonth !== undefined)
            company.fiscalStartMonth = dto.fiscalStartMonth;
        if (dto.status !== undefined)
            company.status = dto.status;
        if (dto.remark !== undefined)
            company.remark = dto.remark.trim() || null;
        const saved = await this.companyRepo.save(company);
        (0, company_scope_interceptor_1.invalidateCompanyCache)(id);
        return saved;
    }
    /**
     * 删除公司。
     * 默认要求无业务数据；force=true 时（前端二次确认后）连同该公司全部业务数据一并
     * 级联删除，删除后不可恢复。
     */
    async remove(id, operatorId, force = false) {
        // 先校验存在性（不存在时给出明确错误）
        await this.getEntity(id);
        const total = await this.companyRepo.count();
        if (total <= 1)
            throw new common_1.BadRequestException('至少保留一家记账公司');
        const stats = await this.countBusinessData(id);
        const dirty = Object.entries(stats).filter(([, n]) => n > 0);
        if (dirty.length && !force) {
            throw new common_1.BadRequestException('该公司已有账务数据（' +
                dirty.map(([k, n]) => k + ' ' + n + ' 条').join('，') +
                '），请先清理后再删除');
        }
        const links = await this.linkRepo.find({ where: { companyId: id } });
        const others = links.filter((l) => l.userId !== operatorId);
        if (others.length) {
            throw new common_1.BadRequestException('该公司仍授权给其他用户，请先取消授权');
        }
        await this.purgeCompanyData(id);
        await this.linkRepo.delete({ companyId: id });
        await this.companyRepo.delete(id);
        (0, company_scope_interceptor_1.invalidateCompanyCache)(id);
        return {
            message: dirty.length
                ? '删除成功，该公司全部业务数据已清除（不可恢复）'
                : '删除成功',
        };
    }
    /**
     * 删除该公司名下的全部数据（凭证、分录、票据、报销、工资、往来、科目等）。
     * 无论是否强制删除都会执行：公司删除后这些数据一并清除，不可恢复。
     */
    async purgeCompanyData(companyId) {
        const tables = [
            'fin_voucher_entry',
            'fin_voucher',
            'fin_receipt',
            'fin_payroll_item',
            'fin_payroll',
            'fin_expense_claim_item',
            'fin_expense_claim',
            'fin_employee',
            'fin_income_expense',
            'fin_write_off',
            'fin_cash_flow',
            'fin_initial_balance',
            'fin_bank_account',
            'fin_project',
            'fin_department',
            'fin_partner',
            'fin_classify_rule',
            'fin_account',
        ];
        const repo = this.accountRepo.manager;
        for (const table of tables) {
            try {
                await repo.getRepository(table).delete({ companyId });
            }
            catch (err) {
                this.logger.warn(`清理 ${table} 失败: ${err.message}`);
            }
        }
    }
    // ==================== 成员授权 ====================
    /** 授权若干用户访问该公司（幂等） */
    async addMembers(companyId, userIds, asOwner = false) {
        if (!userIds.length)
            return { added: 0 };
        await this.getEntity(companyId);
        const users = await this.userRepo.find({ where: { id: (0, typeorm_2.In)(userIds) } });
        if (users.length !== userIds.length) {
            const found = new Set(users.map((u) => u.id));
            const missing = userIds.filter((id) => !found.has(id));
            throw new common_1.BadRequestException(`存在无效的用户：${missing.join('、')}`);
        }
        const existing = await this.linkRepo.find({ where: { companyId } });
        const byUser = new Map(existing.map((l) => [l.userId, l]));
        let added = 0;
        for (const userId of userIds) {
            const link = byUser.get(userId);
            if (link) {
                if (link.status !== 1) {
                    link.status = 1;
                    await this.linkRepo.save(link);
                }
                continue;
            }
            await this.linkRepo.save(this.linkRepo.create({ userId, companyId, isOwner: asOwner, status: 1 }));
            added += 1;
        }
        return { added };
    }
    /** 批量授权并可同时覆盖用户角色（角色为全局 RBAC，对所有公司生效） */
    async setMembers(companyId, dto) {
        await this.getEntity(companyId);
        const links = await this.linkRepo.find({ where: { companyId, status: 1 } });
        const keep = new Set(dto.userIds);
        if (links.length > 1) {
            const removingOwner = links
                .filter((l) => !keep.has(l.userId) && l.isOwner)
                .map((l) => l.userId);
            if (removingOwner.length) {
                throw new common_1.BadRequestException('不能移除公司所有者，请先转让所有权');
            }
        }
        await this.addMembers(companyId, dto.userIds);
        if (dto.roleIds !== undefined) {
            if (!dto.roleIds.length)
                throw new common_1.BadRequestException('请至少选择一个角色');
            const roles = await this.roleRepo.find({ where: { id: (0, typeorm_2.In)(dto.roleIds) } });
            if (roles.length !== dto.roleIds.length)
                throw new common_1.BadRequestException('存在无效的角色');
            const users = await this.userRepo.find({
                where: { id: (0, typeorm_2.In)(dto.userIds) },
                relations: { roles: true },
            });
            for (const user of users) {
                user.roles = roles;
                await this.userRepo.save(user);
            }
        }
        const toRemove = links.filter((l) => !keep.has(l.userId));
        if (toRemove.length) {
            await this.linkRepo.delete({ id: (0, typeorm_2.In)(toRemove.map((l) => l.id)) });
        }
        return this.findOne(companyId);
    }
    /** 取消某个用户的公司访问权 */
    async removeMember(companyId, userId) {
        const link = await this.linkRepo.findOne({ where: { companyId, userId } });
        if (!link)
            throw new common_1.NotFoundException('该用户未被授权此公司');
        const total = await this.linkRepo.count({ where: { companyId, status: 1 } });
        if (total <= 1)
            throw new common_1.BadRequestException('公司至少需要保留一个可访问用户');
        if (link.isOwner)
            throw new common_1.BadRequestException('不能移除公司所有者');
        await this.linkRepo.delete({ id: link.id });
        return { message: '已取消授权' };
    }
    // ==================== 内部 ====================
    async getEntity(id) {
        const company = await this.companyRepo.findOne({ where: { id } });
        if (!company)
            throw new common_1.NotFoundException('记账公司不存在');
        return company;
    }
    /** 自动编码：GS001 递增，与公司名称无关，保证编码规范可读 */
    async nextCode(_name) {
        let n = 1;
        let code = `GS${String(n).padStart(3, '0')}`;
        while (await this.companyRepo.findOne({ where: { code } })) {
            n += 1;
            code = `GS${String(n).padStart(3, '0')}`;
        }
        return code;
    }
    /**
     * 初始化公司会计科目。
     *
     * 默认从内置标准模板生成；copyFromCurrent 为真时优先复制当前公司科目
     * （保留自定义科目与辅助核算设置），当前公司无科目时才回落到模板。
     *
     * 注意：这里走的是原始仓储而非隔离仓储，必须显式按 companyId 过滤，
     * 否则会读到其他公司的科目导致「看起来已初始化」的误判。
     */
    async initAccounts(companyId, copyFromCurrent) {
        const existing = await this.accountRepo.count({ where: { companyId } });
        if (existing > 0)
            return 0;
        if (copyFromCurrent) {
            const copied = await this.copyAccountsFromCurrent(companyId);
            if (copied > 0)
                return copied;
        }
        return this.seedTemplateAccounts(companyId);
    }
    /** 复制当前公司的科目（重映射主键，保持父子关系） */
    async copyAccountsFromCurrent(companyId) {
        // 只复制当前公司（上下文中的公司）的科目
        const currentId = (0, company_context_1.getCompanyContext)()?.companyId;
        const source = currentId
            ? await this.accountRepo.find({ where: { companyId: currentId }, order: { sort: 'ASC' } })
            : [];
        if (!source.length)
            return 0;
        const idMap = new Map();
        const rows = [];
        for (const a of source) {
            const entity = this.accountRepo.create({
                companyId,
                code: a.code,
                name: a.name,
                fullName: a.fullName,
                category: a.category,
                level: a.level,
                direction: a.direction,
                parentId: null,
                isLeaf: a.isLeaf,
                auxiliaryTypes: a.auxiliaryTypes,
                isCash: a.isCash,
                isBank: a.isBank,
                status: a.status,
                sort: a.sort,
                remark: a.remark,
            });
            const saved = await this.accountRepo.save(entity);
            idMap.set(a.id, saved.id);
            rows.push(saved);
        }
        // 回填父级关系
        for (const a of source) {
            if (!a.parentId)
                continue;
            const child = rows.find((r) => r.code === a.code);
            const parentId = idMap.get(a.parentId);
            if (child && parentId) {
                await this.accountRepo.update({ id: child.id }, { parentId });
            }
        }
        return rows.length;
    }
    /** 从内置标准模板生成科目（与系统首次初始化一致） */
    async seedTemplateAccounts(companyId) {
        let order = 0;
        const saveRecursive = async (nodes, parentId, parentPath) => {
            let count = 0;
            for (const node of nodes) {
                order += 1;
                const category = (0, account_seed_1.inferCategory)(node.code);
                const path = [account_seed_1.CATEGORY_LABELS[category] ?? category, ...parentPath, node.name];
                const saved = await this.accountRepo.save(this.accountRepo.create({
                    companyId,
                    code: node.code,
                    name: node.name,
                    fullName: path.join('.'),
                    category,
                    level: path.length - 1,
                    direction: node.direction,
                    parentId,
                    isLeaf: !node.children?.length,
                    auxiliaryTypes: node.auxiliaryTypes ?? null,
                    isCash: node.isCash ?? false,
                    isBank: node.isBank ?? false,
                    status: 1,
                    sort: node.sort ?? order,
                    remark: null,
                }));
                count += 1;
                if (node.children?.length) {
                    count += await saveRecursive(node.children, saved.id, path);
                }
            }
            return count;
        };
        return saveRecursive(account_seed_1.ACCOUNT_SEED, null, []);
    }
    /**
     * 统计该公司的记账业务数据量（删除前校验）。
     *
     * 只统计「记账凭证及其衍生单据」这类真正的账务记录；
     * 会计科目 / 往来单位等基础档案在建公司时即自动生成或由用户录入，
     * 属于可重建的参考数据，会随公司一并清除，不作为删除障碍。
     */
    async countBusinessData(companyId) {
        const [vouchers, entries, claims, payrolls, receipts] = await Promise.all([
            this.voucherRepo.count({ where: { companyId } }),
            this.entryRepo.count({ where: { companyId } }),
            this.extraCount('fin_expense_claim', companyId),
            this.extraCount('fin_payroll', companyId),
            this.extraCount('fin_receipt', companyId),
        ]);
        return { 记账凭证: vouchers, 凭证分录: entries, 报销单: claims, 工资单: payrolls, 票据: receipts };
    }
    /** 统计指定表在该公司的数据量 */
    async extraCount(table, companyId) {
        try {
            return await this.accountRepo.manager.getRepository(table).count({ where: { companyId } });
        }
        catch {
            return 0;
        }
    }
    toVo(company, link) {
        return {
            id: company.id,
            code: company.code,
            name: company.name,
            taxNo: company.taxNo,
            taxpayerType: company.taxpayerType,
            vatRate: company.vatRate,
            taxDeclareCycle: company.taxDeclareCycle,
            autoPostThreshold: company.autoPostThreshold,
            autoPostEnabled: company.autoPostEnabled,
            legalPerson: company.legalPerson,
            industry: company.industry,
            address: company.address,
            bankName: company.bankName,
            bankAccount: company.bankAccount,
            fiscalStartMonth: company.fiscalStartMonth,
            status: company.status,
            remark: company.remark,
            createdAt: company.createdAt,
            isOwner: link?.isOwner ?? false,
        };
    }
};
exports.CompaniesService = CompaniesService;
exports.CompaniesService = CompaniesService = CompaniesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(company_entity_1.Company)),
    __param(1, (0, typeorm_1.InjectRepository)(user_company_entity_1.UserCompany)),
    __param(2, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(3, (0, typeorm_1.InjectRepository)(role_entity_1.Role)),
    __param(4, (0, typeorm_1.InjectRepository)(account_entity_1.Account)),
    __param(5, (0, typeorm_1.InjectRepository)(voucher_entity_1.Voucher)),
    __param(6, (0, typeorm_1.InjectRepository)(voucher_entry_entity_1.VoucherEntry)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], CompaniesService);
