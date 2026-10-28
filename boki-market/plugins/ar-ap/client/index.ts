import ArApPage from './pages/index.vue'
import { registerPlugin } from '@boki/plugin-client'

registerPlugin('ar-ap', {
  components: {
    ArApPage,
  },
})
