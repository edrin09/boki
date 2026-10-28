import DepartmentsPage from './pages/index.vue'
import { registerPlugin } from '@boki/plugin-client'

registerPlugin('departments', {
  components: {
    DepartmentsPage,
  },
})
