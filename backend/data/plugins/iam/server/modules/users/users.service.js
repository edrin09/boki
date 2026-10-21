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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const user_entity_1 = require("@core/entities/user.entity");
const user_company_entity_1 = require("@core/entities/user-company.entity");
const company_entity_1 = require("@core/entities/company.entity");
const role_entity_1 = require("@core/entities/role.entity");
const crypto_util_1 = require("@core/common/utils/crypto.util");
let UsersService = class UsersService {
    userRepo;
    roleRepo;
    linkRepo;
    companyRepo;
    constructor(userRepo, roleRepo, linkRepo, companyRepo) {
        this.userRepo = userRepo;
        this.roleRepo = roleRepo;
        this.linkRepo = linkRepo;
        this.companyRepo = companyRepo;
    }
    /** 分页查询用户 */
    async findAll(query) {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        const qb = this.userRepo
            .createQueryBuilder('u')
            .leftJoinAndSelect('u.roles', 'roles')
            .skip((page - 1) * pageSize)
            .take(pageSize);
        if (query.keyword) {
            qb.andWhere(new typeorm_2.Brackets((w) => {
                w.where('u.username LIKE :kw', { kw: `%${query.keyword}%` })
                    .orWhere('u.nickname LIKE :kw', { kw: `%${query.keyword}%` })
                    .orWhere('u.phone LIKE :kw', { kw: `%${query.keyword}%` });
            }));
        }
        const order = (query.sortOrder ?? 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
        const allowedSort = ['createdAt', 'username', 'nickname', 'lastLoginAt'];
        const sortBy = allowedSort.includes(query.sortBy ?? '') ? query.sortBy : 'createdAt';
        qb.orderBy(`u.${sortBy}`, order);
        const [list, total] = await qb.getManyAndCount();
        const access = await this.companyAccessMap(list.map((u) => u.id));
        return {
            list: list.map((u) => {
                const acc = access.get(u.id) ?? { companyIds: [], companyNames: [] };
                return this.toVo(u, acc.companyIds, acc.companyNames);
            }),
            total,
            page,
            pageSize,
        };
    }
    /** 查询全部用户（下拉选项） */
    async findAllOptions() {
        const users = await this.userRepo.find({ order: { nickname: 'ASC' } });
        return users.map((u) => ({ id: u.id, username: u.username, nickname: u.nickname }));
    }
    /** 详情 */
    async findOne(id) {
        const user = await this.getEntity(id);
        const acc = await this.companyAccessOf(user.id);
        return this.toVo(user, acc.companyIds, acc.companyNames);
    }
    /** 新增用户 */
    async create(dto) {
        const exists = await this.userRepo.findOne({ where: { username: dto.username } });
        if (exists)
            throw new common_1.ConflictException(`账号「${dto.username}」已存在`);
        const roles = await this.resolveRoles(dto.roleIds);
        const user = this.userRepo.create({
            username: dto.username,
            nickname: dto.nickname,
            password: await (0, crypto_util_1.hashPassword)(dto.password),
            email: dto.email ?? null,
            phone: dto.phone ?? null,
            status: dto.status ?? 1,
            remark: dto.remark ?? null,
            roles,
        });
        const saved = await this.userRepo.save(user);
        if (dto.companyIds?.length) {
            await this.linkCompanies(saved.id, dto.companyIds);
        }
        const acc = await this.companyAccessOf(saved.id);
        return this.toVo(saved, acc.companyIds, acc.companyNames);
    }
    /** 编辑用户 */
    async update(id, dto) {
        const user = await this.getEntity(id);
        if (dto.nickname !== undefined)
            user.nickname = dto.nickname;
        if (dto.email !== undefined)
            user.email = dto.email || null;
        if (dto.phone !== undefined)
            user.phone = dto.phone || null;
        if (dto.remark !== undefined)
            user.remark = dto.remark || null;
        if (dto.status !== undefined) {
            if (dto.status === 0)
                await this.assertNotDisableAdmin(user);
            user.status = dto.status;
        }
        if (dto.roleIds) {
            user.roles = await this.resolveRoles(dto.roleIds);
        }
        if (Array.isArray(dto.companyIds)) {
            const current = (await this.linkRepo.find({ where: { userId: id, status: 1 } })).map((l) => l.companyId);
            const target = dto.companyIds;
            const added = target.filter((c) => !current.includes(c));
            if (added.length)
                await this.linkCompanies(id, added);
            for (const companyId of current.filter((c) => !target.includes(c))) {
                await this.unlinkCompany(id, companyId);
            }
        }
        const saved = await this.userRepo.save(user);
        const acc = await this.companyAccessOf(saved.id);
        return this.toVo(saved, acc.companyIds, acc.companyNames);
    }
    /** 修改状态 */
    async updateStatus(id, status) {
        const user = await this.getEntity(id);
        if (status === 0)
            await this.assertNotDisableAdmin(user);
        user.status = status;
        const saved = await this.userRepo.save(user);
        return this.toVo(saved);
    }
    /** 删除用户 */
    async remove(id) {
        const user = await this.getEntity(id);
        await this.assertNotDeleteAdmin(user);
        await this.userRepo.delete(id);
        return { message: '删除成功' };
    }
    /** 重置密码 */
    async resetPassword(id, dto) {
        const user = await this.getEntity(id);
        await this.userRepo.update(id, { password: await (0, crypto_util_1.hashPassword)(dto.password) });
        return { message: `已重置「${user.nickname}」的密码` };
    }
    /** 分配角色 */
    async assignRoles(id, roleIds) {
        const user = await this.getEntity(id);
        user.roles = await this.resolveRoles(roleIds);
        const saved = await this.userRepo.save(user);
        return this.toVo(saved);
    }
    // ==================== 私有方法 ====================
    /**
     * 为用户开通若干公司的访问权（幂等）。
     *
     * iam 不依赖多公司插件：公司成员关系存放于内核实体 `sys_user_company`，
     * 这里直接按内核语义写入，保证「拔掉 multi-company 插件后用户管理仍可用」。
     */
    async linkCompanies(userId, companyIds) {
        const ids = [...new Set(companyIds)];
        if (!ids.length)
            return;
        const found = await this.companyRepo.count({ where: { id: (0, typeorm_2.In)(ids) } });
        if (found !== ids.length)
            throw new common_1.BadRequestException('存在无效的记账公司');
        const links = await this.linkRepo.find({ where: { userId, companyId: (0, typeorm_2.In)(ids) } });
        const byCompany = new Map(links.map((l) => [l.companyId, l]));
        for (const companyId of ids) {
            const link = byCompany.get(companyId);
            if (link) {
                if (link.status !== 1) {
                    link.status = 1;
                    await this.linkRepo.save(link);
                }
                continue;
            }
            await this.linkRepo.save(this.linkRepo.create({ userId, companyId, isOwner: false, status: 1 }));
        }
    }
    /** 取消用户对某公司的访问权（与内核 CompaniesService 的约束保持一致） */
    async unlinkCompany(userId, companyId) {
        const link = await this.linkRepo.findOne({ where: { userId, companyId } });
        if (!link)
            return;
        if (link.isOwner)
            throw new common_1.BadRequestException('不能移除公司所有者');
        const active = await this.linkRepo.count({ where: { companyId, status: 1 } });
        if (active <= 1)
            throw new common_1.BadRequestException('公司至少需要保留一个可访问用户');
        await this.linkRepo.delete({ id: link.id });
    }
    async getEntity(id) {
        const user = await this.userRepo.findOne({
            where: { id },
            relations: { roles: true },
        });
        if (!user)
            throw new common_1.NotFoundException('用户不存在');
        return user;
    }
    async resolveRoles(roleIds) {
        if (!roleIds?.length)
            throw new common_1.BadRequestException('请至少选择一个角色');
        const roles = await this.roleRepo.find({ where: { id: (0, typeorm_2.In)(roleIds) } });
        if (roles.length !== roleIds.length) {
            throw new common_1.BadRequestException('存在无效的角色');
        }
        return roles;
    }
    async assertNotDisableAdmin(user) {
        const isAdmin = (user.roles ?? []).some((r) => r.code === 'admin');
        if (isAdmin && user.username === 'admin') {
            throw new common_1.BadRequestException('不能禁用内置管理员账号');
        }
    }
    async assertNotDeleteAdmin(user) {
        const isAdmin = (user.roles ?? []).some((r) => r.code === 'admin');
        if (isAdmin && user.username === 'admin') {
            throw new common_1.BadRequestException('不能删除内置管理员账号');
        }
    }
    /** 单个用户的公司访问（含公司名，供列表/表单展示） */
    async companyAccessOf(userId) {
        return ((await this.companyAccessMap([userId])).get(userId) ?? {
            companyIds: [],
            companyNames: [],
        });
    }
    /** 批量查询用户-公司可见性，避免 N+1 */
    async companyAccessMap(userIds) {
        const result = new Map();
        if (!userIds.length)
            return result;
        const links = await this.linkRepo.find({ where: { userId: (0, typeorm_2.In)(userIds), status: 1 } });
        const companyIds = [...new Set(links.map((l) => l.companyId))];
        const companies = companyIds.length
            ? await this.companyRepo.find({ where: { id: (0, typeorm_2.In)(companyIds) } })
            : [];
        const nameById = new Map(companies.map((c) => [c.id, c.name]));
        for (const link of links) {
            const entry = result.get(link.userId) ?? { companyIds: [], companyNames: [] };
            entry.companyIds.push(link.companyId);
            entry.companyNames.push(nameById.get(link.companyId) ?? '');
            result.set(link.userId, entry);
        }
        return result;
    }
    toVo(user, companyIds = [], companyNames = []) {
        return {
            id: user.id,
            username: user.username,
            nickname: user.nickname,
            email: user.email,
            phone: user.phone,
            status: user.status,
            lastLoginAt: user.lastLoginAt,
            remark: user.remark,
            createdAt: user.createdAt,
            roleIds: (user.roles ?? []).map((r) => r.id),
            roles: (user.roles ?? []).map((r) => ({ id: r.id, code: r.code, name: r.name })),
            companyIds,
            companyNames,
        };
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(1, (0, typeorm_1.InjectRepository)(role_entity_1.Role)),
    __param(2, (0, typeorm_1.InjectRepository)(user_company_entity_1.UserCompany)),
    __param(3, (0, typeorm_1.InjectRepository)(company_entity_1.Company)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], UsersService);
