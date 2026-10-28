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
exports.DepartmentsService = void 0;
const common_1 = require("@nestjs/common");
const department_entity_1 = require("@core/entities/department.entity");
const voucher_entry_entity_1 = require("@core/entities/voucher-entry.entity");
const initial_balance_entity_1 = require("@core/entities/initial-balance.entity");
const tree_util_1 = require("@core/common/utils/tree.util");
const code_util_1 = require("@core/common/utils/code.util");
const company_repository_1 = require("@core/common/company/company.repository");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
let DepartmentsService = class DepartmentsService {
    repo;
    entryRepo;
    initialBalanceRepo;
    constructor(repo, entryRepo, initialBalanceRepo) {
        this.repo = repo;
        this.entryRepo = entryRepo;
        this.initialBalanceRepo = initialBalanceRepo;
    }
    async findAll(keyword) {
        const qb = this.repo.createQueryBuilder('d');
        if (keyword) {
            qb.where('(d.code LIKE :kw OR d.name LIKE :kw)', { kw: `%${keyword}%` });
        }
        return qb.orderBy('d.code', 'ASC').getMany();
    }
    async findTree(keyword) {
        const list = await this.findAll(keyword);
        return (0, tree_util_1.sortTree)((0, tree_util_1.buildTree)(list));
    }
    async findOptions() {
        const list = await this.repo.find({ where: { status: 1 }, order: { code: 'ASC' } });
        return list.map((d) => ({ id: d.id, code: d.code, name: d.name }));
    }
    async findOne(id) {
        const entity = await this.repo.findOne({ where: { id } });
        if (!entity)
            throw new common_1.NotFoundException('部门不存在');
        return entity;
    }
    /** 预览下一个可用编码 */
    async getNextCode() {
        return (0, code_util_1.nextCode)(this.repo, code_util_1.CODE_PREFIX.department);
    }
    async create(dto) {
        const code = (dto.code ?? '').trim() || (await this.getNextCode());
        const exists = await this.repo.findOne({ where: { code } });
        if (exists)
            throw new common_1.ConflictException(`部门编码「${code}」已存在`);
        if (dto.parentId)
            await this.findOne(dto.parentId);
        const entity = this.repo.create({
            code,
            name: dto.name,
            parentId: dto.parentId ?? null,
            manager: dto.manager ?? null,
            remark: dto.remark ?? null,
            status: 1,
        });
        return this.repo.save(entity);
    }
    async update(id, dto) {
        const entity = await this.findOne(id);
        if (dto.parentId !== undefined) {
            if (dto.parentId === id)
                throw new common_1.ConflictException('上级部门不能是自己');
            if (dto.parentId) {
                const parent = await this.findOne(dto.parentId);
                const all = await this.repo.find();
                if ((0, tree_util_1.collectDescendantIds)(all, id).has(parent.id)) {
                    throw new common_1.ConflictException('不能将部门移动到自己的下级部门下');
                }
            }
            entity.parentId = dto.parentId || null;
        }
        if (dto.name !== undefined)
            entity.name = dto.name;
        if (dto.manager !== undefined)
            entity.manager = dto.manager || null;
        if (dto.remark !== undefined)
            entity.remark = dto.remark || null;
        if (dto.status !== undefined)
            entity.status = dto.status;
        return this.repo.save(entity);
    }
    async remove(id) {
        await this.findOne(id);
        const all = await this.repo.find();
        if ((0, tree_util_1.collectDescendantIds)(all, id).size > 0) {
            throw new common_1.ConflictException('请先删除下级部门后再删除当前部门');
        }
        const usedEntries = await this.entryRepo.count({ where: { departmentId: id } });
        if (usedEntries > 0) {
            throw new common_1.ConflictException(`该部门已被 ${usedEntries} 条凭证分录引用，无法删除`);
        }
        const usedInitial = await this.initialBalanceRepo.count({ where: { departmentId: id } });
        if (usedInitial > 0) {
            throw new common_1.ConflictException('该部门已录入期初余额，无法删除');
        }
        await this.repo.delete({ id });
        return { message: '删除成功' };
    }
};
exports.DepartmentsService = DepartmentsService;
exports.DepartmentsService = DepartmentsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, company_repo_decorator_1.InjectCompanyRepo)(department_entity_1.Department)),
    __param(1, (0, company_repo_decorator_1.InjectCompanyRepo)(voucher_entry_entity_1.VoucherEntry)),
    __param(2, (0, company_repo_decorator_1.InjectCompanyRepo)(initial_balance_entity_1.InitialBalance)),
    __metadata("design:paramtypes", [company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository])
], DepartmentsService);
