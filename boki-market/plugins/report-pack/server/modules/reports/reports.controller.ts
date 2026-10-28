import { Controller, Get, Query } from '@nestjs/common'
import { ReportsService } from './reports.service'
import { AnalysisService } from './analysis.service'
import { ReportQueryDto } from './dto/report.dto'
import { RequirePermissions } from '@core/common/decorators/permissions.decorator'
import { Operation } from '@core/common/decorators/operation.decorator'

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly analysisService: AnalysisService,
  ) {}

  @Get('balance-sheet')
  @RequirePermissions('reports:balance-sheet')
  @Operation('查询资产负债表')
  balanceSheet(@Query() query: ReportQueryDto) {
    return this.reportsService.balanceSheet(query)
  }

  @Get('profit-loss')
  @RequirePermissions('reports:profit-loss')
  @Operation('查询利润表')
  profitLoss(@Query() query: ReportQueryDto) {
    return this.reportsService.profitLoss(query)
  }

  // ==================== P18 报表增强 ====================

  @Get('ledger')
  @RequirePermissions('reports:ledger')
  @Operation('查询票据台账')
  receiptLedger(@Query() query: ReportQueryDto) {
    return this.analysisService.receiptLedger(query)
  }

  @Get('cash-flow')
  @RequirePermissions('reports:cash-flow')
  @Operation('查询现金流量简表')
  cashFlow(@Query() query: ReportQueryDto) {
    return this.analysisService.cashFlow(query)
  }

  @Get('expense-analysis')
  @RequirePermissions('reports:expense-analysis')
  @Operation('查询费用结构分析')
  expenseAnalysis(@Query() query: ReportQueryDto) {
    return this.analysisService.expenseAnalysis(query)
  }

  @Get('monthly-close')
  @RequirePermissions('reports:monthly-close')
  @Operation('一键月结检查与月度报表包')
  monthlyClose(@Query() query: ReportQueryDto) {
    return this.analysisService.monthlyClose(query)
  }

  @Get('overview')
  @RequirePermissions('reports:overview')
  @Operation('查询经营看板')
  overview(@Query() query: ReportQueryDto) {
    return this.analysisService.overview(query)
  }
}
