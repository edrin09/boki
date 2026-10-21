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
exports.BanksService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const bank_account_entity_1 = require("@core/entities/bank-account.entity");
const account_entity_1 = require("@core/entities/account.entity");
const code_util_1 = require("@core/common/utils/code.util");
const company_repository_1 = require("@core/common/company/company.repository");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
let BanksService = class BanksService {
    repo;
    accountRepo;
    constructor(repo, accountRepo) {
        this.repo = repo;
        this.accountRepo = accountRepo;
    }
    async findAll(query) {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        const qb = this.repo.createQueryBuilder('b');
        if (query.keyword) {
            qb.andWhere(new typeorm_1.Brackets((w) => {
                w.where('b.code LIKE :kw', { kw: `%${query.keyword}%` })
                    .orWhere('b.name LIKE :kw', { kw: `%${query.keyword}%` })
                    .orWhere('b.accountNo LIKE :kw', { kw: `%${query.keyword}%` })
                    .orWhere('b.bankName LIKE :kw', { kw: `%${query.keyword}%` });
            }));
        }
        if (query.type)
            qb.andWhere('b.type = :type', { type: query.type });
        const [list, total] = await qb
            .orderBy('b.code', 'ASC')
            .skip((page - 1) * pageSize)
            .take(pageSize)
            .getManyAndCount();
        return { list, total, page, pageSize };
    }
    async findOptions(type) {
        const list = await this.repo.find({ where: { status: 1 }, order: { code: 'ASC' } });
        return list
            .filter((b) => !type || b.type === type)
            .map((b) => ({ id: b.id, code: b.code, name: b.name, type: b.type, accountCode: b.accountCode }));
    }
    async findOne(id) {
        const entity = await this.repo.findOne({ where: { id } });
        if (!entity)
            throw new common_1.NotFoundException('资金账户不存在');
        return entity;
    }
    /** 预览下一个可用编码 */
    async getNextCode() {
        return (0, code_util_1.nextCode)(this.repo, code_util_1.CODE_PREFIX.bank);
    }
    async create(dto) {
        const code = (dto.code ?? '').trim() || (await this.getNextCode());
        const exists = await this.repo.findOne({ where: { code } });
        if (exists)
            throw new common_1.ConflictException(`编码「${code}」已存在`);
        if (dto.accountCode)
            await this.assertAccountExists(dto.accountCode);
        const entity = this.repo.create({
            code,
            name: dto.name,
            type: (dto.type ?? 'bank'),
            currency: 'CNY',
            accountCode: dto.accountCode ?? null,
            accountNo: dto.accountNo ?? null,
            bankName: dto.bankName ?? null,
            accountName: dto.accountName ?? null,
            remark: dto.remark ?? null,
            status: 1,
        });
        return this.repo.save(entity);
    }
    async update(id, dto) {
        const entity = await this.findOne(id);
        if (dto.name !== undefined)
            entity.name = dto.name;
        if (dto.type !== undefined)
            entity.type = dto.type;
        if (dto.accountCode !== undefined) {
            if (dto.accountCode)
                await this.assertAccountExists(dto.accountCode);
            entity.accountCode = dto.accountCode || null;
        }
        if (dto.accountNo !== undefined)
            entity.accountNo = dto.accountNo || null;
        if (dto.bankName !== undefined)
            entity.bankName = dto.bankName || null;
        if (dto.accountName !== undefined)
            entity.accountName = dto.accountName || null;
        if (dto.remark !== undefined)
            entity.remark = dto.remark || null;
        if (dto.status !== undefined)
            entity.status = dto.status;
        return this.repo.save(entity);
    }
    async remove(id) {
        await this.findOne(id);
        await this.repo.delete({ id });
        return { message: '删除成功' };
    }
    async assertAccountExists(code) {
        const exists = await this.accountRepo.findOne({ where: { code } });
        if (!exists)
            throw new common_1.NotFoundException(`关联科目「${code}」不存在`);
    }
};
exports.BanksService = BanksService;
exports.BanksService = BanksService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, company_repo_decorator_1.InjectCompanyRepo)(bank_account_entity_1.BankAccount)),
    __param(1, (0, company_repo_decorator_1.InjectCompanyRepo)(account_entity_1.Account)),
    __metadata("design:paramtypes", [company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository])
], BanksService);
