import HrEmployeesPage from './pages/employees.vue'
import HrExpenseClaimsPage from './pages/expense-claims.vue'
import HrLoansPage from './pages/loans.vue'
import HrPayrollsPage from './pages/payrolls.vue'
import HrPayrollEditPage from './pages/payroll-edit.vue'
import { registerPlugin } from '@boki/plugin-client'

registerPlugin('hr', {
  components: {
    HrEmployeesPage,
    HrExpenseClaimsPage,
    HrLoansPage,
    HrPayrollsPage,
    HrPayrollEditPage,
  },
})
