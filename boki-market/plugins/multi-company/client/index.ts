import MultiCompanyPage from './pages/companies/index.vue'
import { registerPlugin } from '@boki/plugin-client'

registerPlugin('multi-company', {
  components: {
    MultiCompanyPage,
  },
})
