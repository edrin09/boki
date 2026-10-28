import BanksPage from './pages/index.vue'
import { registerPlugin } from '@boki/plugin-client'

registerPlugin('banks', {
  components: {
    BanksPage,
  },
})
