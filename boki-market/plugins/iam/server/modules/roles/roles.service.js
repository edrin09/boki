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
exports.RolesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const role_entity_1 = require("@core/entities/role.entity");
const permission_entity_1 = require("@core/entities/permission.entity");
let RolesService = class RolesService {
    roleRepo;
    permissionRepo;
    constructor(roleRepo, permissionRepo) {
        this.roleRepo = roleRepo;
        this.permissionRepo = permissionRepo;
    }
    /** 角色列表（含权限） */
    async findAll() {
        const roles = await this.roleRepo.find({
            relations: { permissions: true },
            order: { sort: 'ASC', createdAt: 'ASC' },
        });
        return roles.map((r) => this.toVo(r));
    }
    /** 角色下拉选项 */
    async findOptions() {
        const roles = await this.roleRepo.find({ order: { sort: 'ASC' } });
        return roles.map((r) => ({ id: r.id, code: r.code, name: r.name }));
    }
    async findOne(id) {
        const role = await this.getEntity(id);
        return this.toVo(role);
    }
    async create(dto) {
        const exists = await this.roleRepo.findOne({ where: { code: dto.code } });
        if (exists)
            throw new common_1.ConflictException(`角色标识「${dto.code}」已存在`);
        const role = this.roleRepo.create({
            code: dto.code,
            name: dto.name,
            description: dto.description ?? null,
            isSystem: false,
            sort: dto.sort ?? 0,
        });
        if (dto.permissionIds) {
            role.permissions = await this.resolvePermissions(dto.permissionIds);
        }
        const saved = await this.roleRepo.save(role);
        return this.toVo(saved);
    }
    async update(id, dto) {
        const role = await this.getEntity(id);
        if (dto.name !== undefined)
            role.name = dto.name;
        if (dto.description !== undefined)
            role.description = dto.description || null;
        if (dto.sort !== undefined)
            role.sort = dto.sort;
        const saved = await this.roleRepo.save(role);
        return this.toVo(saved);
    }
    async remove(id) {
        const role = await this.getEntity(id);
        if (role.isSystem)
            throw new common_1.BadRequestException('系统内置角色不可删除');
        await this.roleRepo.delete(id);
        return { message: '删除成功' };
    }
    /** 分配权限 */
    async assignPermissions(id, permissionIds) {
        const role = await this.getEntity(id);
        if (role.isSystem && role.code === 'admin') {
            throw new common_1.BadRequestException('超级管理员固定拥有全部权限，无需分配');
        }
        role.permissions = await this.resolvePermissions(permissionIds);
        const saved = await this.roleRepo.save(role);
        return this.toVo(saved);
    }
    async getEntity(id) {
        const role = await this.roleRepo.findOne({ where: { id }, relations: { permissions: true } });
        if (!role)
            throw new common_1.NotFoundException('角色不存在');
        return role;
    }
    async resolvePermissions(permissionIds) {
        if (!permissionIds.length)
            return [];
        const permissions = await this.permissionRepo.find({ where: { id: (0, typeorm_2.In)(permissionIds) } });
        if (permissions.length !== permissionIds.length) {
            throw new common_1.BadRequestException('存在无效的权限');
        }
        return permissions;
    }
    toVo(role) {
        return {
            id: role.id,
            code: role.code,
            name: role.name,
            description: role.description,
            isSystem: role.isSystem,
            sort: role.sort,
            permissionIds: (role.permissions ?? []).map((p) => p.id),
            permissionCodes: (role.permissions ?? []).map((p) => p.code),
            permissionCount: (role.permissions ?? []).length,
            createdAt: role.createdAt,
        };
    }
};
exports.RolesService = RolesService;
exports.RolesService = RolesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(role_entity_1.Role)),
    __param(1, (0, typeorm_1.InjectRepository)(permission_entity_1.Permission)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository])
], RolesService);
