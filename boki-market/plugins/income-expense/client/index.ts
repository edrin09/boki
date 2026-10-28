import IncomeExpensePage from './pages/index.vue'
import FixedExpensePage from './pages/fixed-expense.vue'
import { registerPlugin } from '@boki/plugin-client'

registerPlugin('income-expense', {
  components: {
    IncomeExpensePage,
    FixedExpensePage,
  },
})
