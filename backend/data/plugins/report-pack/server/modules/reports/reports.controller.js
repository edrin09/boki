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
exports.ReportsController = void 0;
const common_1 = require("@nestjs/common");
const reports_service_1 = require("./reports.service");
const analysis_service_1 = require("./analysis.service");
const report_dto_1 = require("./dto/report.dto");
const permissions_decorator_1 = require("@core/common/decorators/permissions.decorator");
const operation_decorator_1 = require("@core/common/decorators/operation.decorator");
let ReportsController = class ReportsController {
    reportsService;
    analysisService;
    constructor(reportsService, analysisService) {
        this.reportsService = reportsService;
        this.analysisService = analysisService;
    }
    balanceSheet(query) {
        return this.reportsService.balanceSheet(query);
    }
    profitLoss(query) {
        return this.reportsService.profitLoss(query);
    }
    // ==================== P18 报表增强 ====================
    receiptLedger(query) {
        return this.analysisService.receiptLedger(query);
    }
    cashFlow(query) {
        return this.analysisService.cashFlow(query);
    }
    expenseAnalysis(query) {
        return this.analysisService.expenseAnalysis(query);
    }
    monthlyClose(query) {
        return this.analysisService.monthlyClose(query);
    }
    overview(query) {
        return this.analysisService.overview(query);
    }
};
exports.ReportsController = ReportsController;
__decorate([
    (0, common_1.Get)('balance-sheet'),
    (0, permissions_decorator_1.RequirePermissions)('reports:balance-sheet'),
    (0, operation_decorator_1.Operation)('查询资产负债表'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [report_dto_1.ReportQueryDto]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "balanceSheet", null);
__decorate([
    (0, common_1.Get)('profit-loss'),
    (0, permissions_decorator_1.RequirePermissions)('reports:profit-loss'),
    (0, operation_decorator_1.Operation)('查询利润表'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [report_dto_1.ReportQueryDto]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "profitLoss", null);
__decorate([
    (0, common_1.Get)('ledger'),
    (0, permissions_decorator_1.RequirePermissions)('reports:ledger'),
    (0, operation_decorator_1.Operation)('查询票据台账'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [report_dto_1.ReportQueryDto]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "receiptLedger", null);
__decorate([
    (0, common_1.Get)('cash-flow'),
    (0, permissions_decorator_1.RequirePermissions)('reports:cash-flow'),
    (0, operation_decorator_1.Operation)('查询现金流量简表'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [report_dto_1.ReportQueryDto]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "cashFlow", null);
__decorate([
    (0, common_1.Get)('expense-analysis'),
    (0, permissions_decorator_1.RequirePermissions)('reports:expense-analysis'),
    (0, operation_decorator_1.Operation)('查询费用结构分析'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [report_dto_1.ReportQueryDto]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "expenseAnalysis", null);
__decorate([
    (0, common_1.Get)('monthly-close'),
    (0, permissions_decorator_1.RequirePermissions)('reports:monthly-close'),
    (0, operation_decorator_1.Operation)('一键月结检查与月度报表包'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [report_dto_1.ReportQueryDto]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "monthlyClose", null);
__decorate([
    (0, common_1.Get)('overview'),
    (0, permissions_decorator_1.RequirePermissions)('reports:overview'),
    (0, operation_decorator_1.Operation)('查询经营看板'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [report_dto_1.ReportQueryDto]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "overview", null);
exports.ReportsController = ReportsController = __decorate([
    (0, common_1.Controller)('reports'),
    __metadata("design:paramtypes", [reports_service_1.ReportsService,
        analysis_service_1.AnalysisService])
], ReportsController);
