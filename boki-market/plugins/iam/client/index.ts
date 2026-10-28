import IamUsersPage from './pages/users/index.vue'
import IamRolesPage from './pages/roles/index.vue'
import IamPermissionsPage from './pages/permissions/index.vue'
import { registerPlugin } from '@boki/plugin-client'

registerPlugin('iam', {
  components: {
    IamUsersPage,
    IamRolesPage,
    IamPermissionsPage,
  },
})
