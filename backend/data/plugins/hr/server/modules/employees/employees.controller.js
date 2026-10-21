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
exports.EmployeesController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const employees_service_1 = require("./employees.service");
const employees_import_service_1 = require("./employees-import.service");
const employee_dto_1 = require("./dto/employee.dto");
const employee_import_dto_1 = require("./dto/employee-import.dto");
const pagination_dto_1 = require("@core/common/dto/pagination.dto");
const permissions_decorator_1 = require("@core/common/decorators/permissions.decorator");
const operation_decorator_1 = require("@core/common/decorators/operation.decorator");
let EmployeesController = class EmployeesController {
    employeesService;
    importService;
    constructor(employeesService, importService) {
        this.employeesService = employeesService;
        this.importService = importService;
    }
    findAll(query, status, departmentId) {
        return this.employeesService.findAll({
            ...query,
            status: status !== undefined && status !== '' ? Number(status) : undefined,
            departmentId,
        });
    }
    options(onlyOnJob) {
        return this.employeesService.findOptions(onlyOnJob !== 'false');
    }
    findOne(id) {
        return this.employeesService.findOne(id);
    }
    findDebts(id) {
        return this.employeesService.findDebts(id);
    }
    create(dto) {
        return this.employeesService.create(dto);
    }
    createBatch(dto) {
        return this.employeesService.createBatch(dto.items);
    }
    importFile(file) {
        if (!file)
            throw new common_1.BadRequestException('请上传花名册文件（Excel/CSV）');
        return this.importService.parseFile(file.buffer, file.originalname);
    }
    importCommit(dto) {
        return this.importService.commit(dto);
    }
    update(id, dto) {
        return this.employeesService.update(id, dto);
    }
    remove(id) {
        return this.employeesService.remove(id);
    }
};
exports.EmployeesController = EmployeesController;
__decorate([
    (0, common_1.Get)(),
    (0, permissions_decorator_1.RequirePermissions)('hr:employee'),
    (0, operation_decorator_1.Operation)('查询员工列表'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Query)('status')),
    __param(2, (0, common_1.Query)('departmentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pagination_dto_1.PaginationQueryDto, String, String]),
    __metadata("design:returntype", void 0)
], EmployeesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('options'),
    (0, operation_decorator_1.Operation)('查询员工下拉选项'),
    __param(0, (0, common_1.Query)('onlyOnJob')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], EmployeesController.prototype, "options", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, permissions_decorator_1.RequirePermissions)('hr:employee'),
    (0, operation_decorator_1.Operation)('查询员工详情'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], EmployeesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)(':id/loans'),
    (0, permissions_decorator_1.RequirePermissions)('hr:employee'),
    (0, operation_decorator_1.Operation)('查询员工欠款明细（借款单/核销流水/汇总）'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], EmployeesController.prototype, "findDebts", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, permissions_decorator_1.RequirePermissions)('hr:employee:create'),
    (0, operation_decorator_1.Operation)('新增员工'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [employee_dto_1.CreateEmployeeDto]),
    __metadata("design:returntype", void 0)
], EmployeesController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('batch'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('hr:employee:create'),
    (0, operation_decorator_1.Operation)('批量新增员工'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [employee_dto_1.BatchCreateEmployeeDto]),
    __metadata("design:returntype", void 0)
], EmployeesController.prototype, "createBatch", null);
__decorate([
    (0, common_1.Post)('import'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('hr:employee:create'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        storage: (0, multer_1.memoryStorage)(),
        defParamCharset: 'utf8',
        limits: { fileSize: 20 * 1024 * 1024 },
    })),
    (0, operation_decorator_1.Operation)('导入员工花名册（预览解析）'),
    __param(0, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], EmployeesController.prototype, "importFile", null);
__decorate([
    (0, common_1.Post)('import/commit'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, permissions_decorator_1.RequirePermissions)('hr:employee:create'),
    (0, operation_decorator_1.Operation)('确认导入花名册（批量建档）'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [employee_import_dto_1.CommitEmployeesImportDto]),
    __metadata("design:returntype", void 0)
], EmployeesController.prototype, "importCommit", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, permissions_decorator_1.RequirePermissions)('hr:employee:update'),
    (0, operation_decorator_1.Operation)('编辑员工'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, employee_dto_1.UpdateEmployeeDto]),
    __metadata("design:returntype", void 0)
], EmployeesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.RequirePermissions)('hr:employee:delete'),
    (0, operation_decorator_1.Operation)('删除员工'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], EmployeesController.prototype, "remove", null);
exports.EmployeesController = EmployeesController = __decorate([
    (0, common_1.Controller)('employees'),
    __metadata("design:paramtypes", [employees_service_1.EmployeesService,
        employees_import_service_1.EmployeesImportService])
], EmployeesController);
