import CashBankPage from './pages/index.vue'
import BankStmtPage from './pages/bank-stmt.vue'
import { registerPlugin } from '@boki/plugin-client'

registerPlugin('cash-bank', {
  components: {
    CashBankPage,
    BankStmtPage,
  },
})
