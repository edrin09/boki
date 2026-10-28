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
exports.ClassifyRulesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const classify_rule_entity_1 = require("@core/entities/classify-rule.entity");
const account_entity_1 = require("@core/entities/account.entity");
const company_repository_1 = require("@core/common/company/company.repository");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
/**
 * 归类规则维护（P17.5）：增删改、启停、按命中次数排序。
 * 规则的语义由 classify.service 消费。
 */
let ClassifyRulesService = class ClassifyRulesService {
    ruleRepo;
    accountRepo;
    constructor(ruleRepo, accountRepo) {
        this.ruleRepo = ruleRepo;
        this.accountRepo = accountRepo;
    }
    async findAll(query) {
        const page = query.page ?? 1;
        const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
        const qb = this.ruleRepo.createQueryBuilder('r');
        if (query.matchType)
            qb.andWhere('r.matchType = :matchType', { matchType: query.matchType });
        if (query.keyword) {
            qb.andWhere(new typeorm_1.Brackets((w) => {
                w.where('r.ruleName LIKE :kw', { kw: `%${query.keyword}%` })
                    .orWhere('r.matchValue LIKE :kw', { kw: `%${query.keyword}%` })
                    .orWhere('r.targetAccountCode LIKE :kw', { kw: `%${query.keyword}%` });
            }));
        }
        const [list, total] = await qb
            .orderBy('r.priority', 'DESC')
            .addOrderBy('r.hitCount', 'DESC')
            .addOrderBy('r.createdAt', 'ASC')
            .skip((page - 1) * pageSize)
            .take(pageSize)
            .getManyAndCount();
        return { list: list.map((r) => this.toVo(r)), total, page, pageSize };
    }
    async create(dto) {
        await this.validateAccount(dto.targetAccountCode);
        const dup = await this.ruleRepo.findOne({
            where: { matchType: dto.matchType, matchValue: dto.matchValue },
        });
        if (dup) {
            throw new common_1.ConflictException(`已存在相同匹配方式的规则「${dup.ruleName}」，请先编辑原规则`);
        }
        const rule = this.ruleRepo.create({
            ruleName: dto.ruleName,
            matchType: dto.matchType,
            matchValue: dto.matchValue,
            kind: dto.kind,
            targetAccountCode: dto.targetAccountCode,
            priority: dto.priority ?? 0,
            enabled: dto.enabled ?? 1,
            hitCount: 0,
            learned: false,
        });
        const saved = await this.ruleRepo.save(rule);
        return this.toVo(saved);
    }
    async update(id, dto) {
        const rule = await this.findEntity(id);
        await this.validateAccount(dto.targetAccountCode);
        const dup = await this.ruleRepo
            .createQueryBuilder('r')
            .where('r.matchType = :matchType', { matchType: dto.matchType })
            .andWhere('r.matchValue = :matchValue', { matchValue: dto.matchValue })
            .andWhere('r.id != :id', { id })
            .getOne();
        if (dup) {
            throw new common_1.ConflictException(`已存在相同匹配方式的规则「${dup.ruleName}」，请先编辑原规则`);
        }
        rule.ruleName = dto.ruleName;
        rule.matchType = dto.matchType;
        rule.matchValue = dto.matchValue;
        rule.kind = dto.kind;
        rule.targetAccountCode = dto.targetAccountCode;
        rule.priority = dto.priority ?? rule.priority;
        rule.enabled = dto.enabled ?? rule.enabled;
        const saved = await this.ruleRepo.save(rule);
        return this.toVo(saved);
    }
    async findOne(id) {
        return this.toVo(await this.findEntity(id));
    }
    async toggle(id, dto) {
        const rule = await this.findEntity(id);
        rule.enabled = dto.enabled;
        const saved = await this.ruleRepo.save(rule);
        return this.toVo(saved);
    }
    async remove(id) {
        await this.findEntity(id);
        await this.ruleRepo.delete({ id });
        return { message: '规则已删除' };
    }
    /** 规则 → 前端展示对象 */
    toVo(r) {
        return {
            id: r.id,
            ruleName: r.ruleName,
            matchType: r.matchType,
            matchValue: r.matchValue,
            kind: r.kind,
            targetAccountCode: r.targetAccountCode,
            priority: r.priority,
            enabled: r.enabled,
            hitCount: r.hitCount,
            learned: r.learned,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
        };
    }
    async findEntity(id) {
        const rule = await this.ruleRepo.findOne({ where: { id } });
        if (!rule)
            throw new common_1.NotFoundException('归类规则不存在');
        return rule;
    }
    async validateAccount(code) {
        const account = await this.accountRepo.findOne({ where: { code } });
        if (!account)
            throw new common_1.BadRequestException(`科目编码「${code}」不存在`);
        if (!account.isLeaf) {
            throw new common_1.BadRequestException(`科目「${account.fullName}」不是明细科目，不能作为归类目标`);
        }
        if (account.status !== 1) {
            throw new common_1.BadRequestException(`科目「${account.fullName}」已禁用`);
        }
    }
};
exports.ClassifyRulesService = ClassifyRulesService;
exports.ClassifyRulesService = ClassifyRulesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, company_repo_decorator_1.InjectCompanyRepo)(classify_rule_entity_1.ClassifyRule)),
    __param(1, (0, company_repo_decorator_1.InjectCompanyRepo)(account_entity_1.Account)),
    __metadata("design:paramtypes", [company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository])
], ClassifyRulesService);
