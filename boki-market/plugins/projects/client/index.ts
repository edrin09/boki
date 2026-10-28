import ProjectsPage from './pages/index.vue'
import { registerPlugin } from '@boki/plugin-client'

registerPlugin('projects', {
  components: {
    ProjectsPage,
  },
})
