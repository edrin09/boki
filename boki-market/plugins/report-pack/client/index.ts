import DashboardPage from './pages/dashboard.vue'
import ReportBalanceSheetPage from './pages/balance-sheet.vue'
import ReportProfitLossPage from './pages/profit-loss.vue'
import ReportLedgerPage from './pages/ledger.vue'
import ReportCashFlowPage from './pages/cash-flow.vue'
import ReportExpenseAnalysisPage from './pages/expense-analysis.vue'
import ReportMonthlyClosePage from './pages/monthly-close.vue'
import { registerPlugin } from '@boki/plugin-client'

registerPlugin('report-pack', {
  components: {
    DashboardPage,
    ReportBalanceSheetPage,
    ReportProfitLossPage,
    ReportLedgerPage,
    ReportCashFlowPage,
    ReportExpenseAnalysisPage,
    ReportMonthlyClosePage,
  },
})
