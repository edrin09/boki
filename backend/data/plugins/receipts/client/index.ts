import ReceiptListPage from './pages/list.vue'
import ReceiptWorkbenchPage from './pages/workbench.vue'
import ReceiptRulesPage from './pages/rules.vue'
import { registerPlugin } from '@boki/plugin-client'

registerPlugin('receipts', {
  components: {
    ReceiptListPage,
    ReceiptWorkbenchPage,
    ReceiptRulesPage,
  },
})
