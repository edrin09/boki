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
exports.ProjectsService = void 0;
const common_1 = require("@nestjs/common");
const project_entity_1 = require("@core/entities/project.entity");
const voucher_entry_entity_1 = require("@core/entities/voucher-entry.entity");
const initial_balance_entity_1 = require("@core/entities/initial-balance.entity");
const contract_parser_1 = require("./contract-parser");
const ocr_1 = require("@plugin/ocr/server/modules/ocr");
const code_util_1 = require("@core/common/utils/code.util");
const company_repository_1 = require("@core/common/company/company.repository");
const company_repo_decorator_1 = require("@core/common/company/company-repo.decorator");
let ProjectsService = class ProjectsService {
    repo;
    entryRepo;
    initialBalanceRepo;
    ocrEngine;
    constructor(repo, entryRepo, initialBalanceRepo, ocrEngine) {
        this.repo = repo;
        this.entryRepo = entryRepo;
        this.initialBalanceRepo = initialBalanceRepo;
        this.ocrEngine = ocrEngine;
    }
    async findAll(query) {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        const qb = this.repo.createQueryBuilder('p');
        if (query.keyword) {
            qb.where('(p.code LIKE :kw OR p.name LIKE :kw)', { kw: `%${query.keyword}%` });
        }
        const [list, total] = await qb
            .orderBy('p.code', 'ASC')
            .skip((page - 1) * pageSize)
            .take(pageSize)
            .getManyAndCount();
        return { list, total, page, pageSize };
    }
    async findOptions() {
        const list = await this.repo.find({ where: { status: 1 }, order: { code: 'ASC' } });
        return list.map((p) => ({ id: p.id, code: p.code, name: p.name }));
    }
    async findOne(id) {
        const entity = await this.repo.findOne({ where: { id } });
        if (!entity)
            throw new common_1.NotFoundException('项目不存在');
        return entity;
    }
    /** 预览下一个可用编码 */
    async getNextCode() {
        return (0, code_util_1.nextCode)(this.repo, code_util_1.CODE_PREFIX.project);
    }
    async create(dto) {
        const code = (dto.code ?? '').trim() || (await this.getNextCode());
        const exists = await this.repo.findOne({ where: { code } });
        if (exists)
            throw new common_1.ConflictException(`项目编码「${code}」已存在`);
        const entity = this.repo.create({
            code,
            name: dto.name,
            manager: dto.manager ?? null,
            contractNo: dto.contractNo ?? null,
            contractAmount: dto.contractAmount ?? 0,
            partnerId: dto.partnerId ?? null,
            startDate: dto.startDate ?? null,
            endDate: dto.endDate ?? null,
            remark: dto.remark ?? null,
            status: 1,
        });
        return this.repo.save(entity);
    }
    async update(id, dto) {
        const entity = await this.findOne(id);
        if (dto.name !== undefined)
            entity.name = dto.name;
        if (dto.manager !== undefined)
            entity.manager = dto.manager || null;
        if (dto.contractNo !== undefined)
            entity.contractNo = dto.contractNo || null;
        if (dto.contractAmount !== undefined)
            entity.contractAmount = dto.contractAmount || 0;
        if (dto.partnerId !== undefined)
            entity.partnerId = dto.partnerId || null;
        if (dto.startDate !== undefined)
            entity.startDate = dto.startDate || null;
        if (dto.endDate !== undefined)
            entity.endDate = dto.endDate || null;
        if (dto.remark !== undefined)
            entity.remark = dto.remark || null;
        if (dto.status !== undefined)
            entity.status = dto.status;
        return this.repo.save(entity);
    }
    /**
     * 项目合同台账：按项目聚合 预收账款(2203)/应收账款(1122)/已确认收入(6001)
     * 尾款 = 合同金额 − 预收 − 应收 − 已确认收入
     */
    async ledger() {
        const projects = await this.repo.find({ order: { code: 'ASC' } });
        if (projects.length === 0)
            return [];
        const rows = await this.entryRepo
            .createQueryBuilder('e')
            .innerJoin('fin_voucher', 'v', 'v.id = e.voucher_id')
            .select('e.project_id', 'projectId')
            .addSelect('e.account_code', 'code')
            .addSelect(`CASE WHEN e.account_code IN ('2203','6001') THEN SUM(e.credit - e.debit) ELSE SUM(e.debit - e.credit) END`, 'bal')
            .where('e.project_id IS NOT NULL')
            .andWhere('e.account_code IN (:...codes)', { codes: ['2203', '1122', '6001'] })
            .andWhere('v.status = :st', { st: 'approved' })
            .groupBy('e.project_id')
            .addGroupBy('e.account_code')
            .getRawMany();
        // partner 名称
        const partnerIds = [...new Set(projects.map((p) => p.partnerId).filter(Boolean))];
        const partners = partnerIds.length
            ? await this.repo.manager.query(`SELECT id, name FROM fin_partner WHERE id IN (${partnerIds.map(() => '?').join(',')})`, partnerIds)
            : [];
        const agg = new Map();
        for (const r of rows) {
            const m = agg.get(r.projectId) ?? {};
            m[r.code] = Math.round((Number(r.bal) + Number.EPSILON) * 100) / 100;
            agg.set(r.projectId, m);
        }
        const pName = new Map(partners.map((p) => [p.id, p.name]));
        return projects.map((p) => {
            const m = agg.get(p.id) ?? {};
            const contract = Number(p.contractAmount ?? 0);
            const advance = m['2203'] ?? 0;
            const receivable = m['1122'] ?? 0;
            const revenue = m['6001'] ?? 0;
            const rest = Math.round((contract - advance - receivable - revenue) * 100) / 100;
            return {
                id: p.id,
                code: p.code,
                name: p.name,
                contractNo: p.contractNo,
                contractAmount: contract,
                partnerId: p.partnerId,
                partnerName: p.partnerId ? pName.get(p.partnerId) ?? null : null,
                advanceReceived: advance,
                receivable,
                recognizedRevenue: revenue,
                restAmount: rest,
            };
        });
    }
    /** 解析合同 PDF，返回关键字段识别建议（用户确认后保存）。扫描件自动走 OCR */
    async parseContract(buffer) {
        return (0, contract_parser_1.parseContractPdf)(buffer, this.ocrEngine);
    }
    async remove(id) {
        await this.findOne(id);
        const usedEntries = await this.entryRepo.count({ where: { projectId: id } });
        if (usedEntries > 0) {
            throw new common_1.ConflictException(`该项目已被 ${usedEntries} 条凭证分录引用，无法删除`);
        }
        const usedInitial = await this.initialBalanceRepo.count({ where: { projectId: id } });
        if (usedInitial > 0) {
            throw new common_1.ConflictException('该项目已录入期初余额，无法删除');
        }
        await this.repo.delete({ id });
        return { message: '删除成功' };
    }
};
exports.ProjectsService = ProjectsService;
exports.ProjectsService = ProjectsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, company_repo_decorator_1.InjectCompanyRepo)(project_entity_1.Project)),
    __param(1, (0, company_repo_decorator_1.InjectCompanyRepo)(voucher_entry_entity_1.VoucherEntry)),
    __param(2, (0, company_repo_decorator_1.InjectCompanyRepo)(initial_balance_entity_1.InitialBalance)),
    __metadata("design:paramtypes", [company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        company_repository_1.CompanyScopedRepository,
        ocr_1.OcrEngine])
], ProjectsService);
