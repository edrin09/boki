import SystemAiPage from './pages/index.vue'
import { registerPlugin } from '@boki/plugin-client'

registerPlugin('ai', {
  components: {
    SystemAiPage,
  },
})
