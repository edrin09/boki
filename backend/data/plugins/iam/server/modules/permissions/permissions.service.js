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
exports.PermissionsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const permission_entity_1 = require("@core/entities/permission.entity");
const tree_util_1 = require("@core/common/utils/tree.util");
const tree_util_2 = require("@core/common/utils/tree.util");
const role_entity_1 = require("@core/entities/role.entity");
let PermissionsService = class PermissionsService {
    permissionRepo;
    roleRepo;
    constructor(permissionRepo, roleRepo) {
        this.permissionRepo = permissionRepo;
        this.roleRepo = roleRepo;
    }
    /** 扁平列表 */
    async findAll() {
        return this.permissionRepo.find({ order: { sort: 'ASC', code: 'ASC' } });
    }
    /** 权限树 */
    async findTree() {
        const list = await this.findAll();
        const tree = (0, tree_util_1.buildTree)(list);
        (0, tree_util_1.sortTree)(tree);
        return tree;
    }
    /** 菜单树（仅 type=menu，供前端动态路由） */
    async findMenuTree() {
        const list = (await this.findAll()).filter((p) => p.type === 'menu');
        const tree = (0, tree_util_1.buildTree)(list);
        (0, tree_util_1.sortTree)(tree);
        return tree;
    }
    async findOne(id) {
        const perm = await this.permissionRepo.findOne({ where: { id } });
        if (!perm)
            throw new common_1.NotFoundException('权限不存在');
        return perm;
    }
    async create(dto) {
        const entity = this.permissionRepo.create({
            code: dto.code,
            name: dto.name,
            module: dto.module ?? (dto.code?.split(':')[0] ?? 'system'),
            type: dto.type ?? 'action',
            parentId: dto.parentId ?? null,
            path: dto.path ?? null,
            icon: dto.icon ?? null,
            sort: dto.sort ?? 0,
            remark: dto.remark ?? null,
        });
        return this.permissionRepo.save(entity);
    }
    async update(id, dto) {
        const perm = await this.findOne(id);
        Object.assign(perm, {
            name: dto.name ?? perm.name,
            module: dto.module ?? perm.module,
            type: dto.type ?? perm.type,
            path: dto.path ?? perm.path,
            icon: dto.icon ?? perm.icon,
            sort: dto.sort ?? perm.sort,
            remark: dto.remark ?? perm.remark,
        });
        return this.permissionRepo.save(perm);
    }
    async remove(id) {
        const perm = await this.findOne(id);
        const all = await this.findAll();
        const descendants = (0, tree_util_2.collectDescendantIds)(all, id);
        if (descendants.size > 0) {
            throw new common_1.NotFoundException('请先删除子权限后再删除当前权限');
        }
        // 被角色引用时禁止删除
        const roles = await this.roleRepo.find({ relations: { permissions: true } });
        const used = roles.find((r) => (r.permissions ?? []).some((p) => p.id === perm.id));
        if (used) {
            throw new common_1.NotFoundException(`权限已被角色「${used.name}」引用，无法删除`);
        }
        await this.permissionRepo.delete(id);
        return { message: '删除成功' };
    }
};
exports.PermissionsService = PermissionsService;
exports.PermissionsService = PermissionsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(permission_entity_1.Permission)),
    __param(1, (0, typeorm_1.InjectRepository)(role_entity_1.Role)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository])
], PermissionsService);
