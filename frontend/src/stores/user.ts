import { defineStore } from 'pinia'
import { authApi, clearToken, getToken, setToken } from '@/api'

export interface UserProfile {
  id: string
  username: string
  nickname: string
  email?: string | null
  phone?: string | null
  roles: string[]
  roleNames: string[]
  permissions: string[]
  lastLoginAt?: string | null
}

export const useUserStore = defineStore('user', {
  state: () => ({
    token: getToken() ?? '',
    profile: null as UserProfile | null,
    loading: false,
  }),

  getters: {
    isLoggedIn: (state) => !!state.token,
    isAdmin: (state) => state.profile?.roles?.includes('admin') ?? false,
    nickname: (state) => state.profile?.nickname ?? '',
    /** 权限判断：admin 全通过 */
    hasPermission: (state) => (code: string | string[]) => {
      const perms = state.profile?.permissions ?? []
      if (perms.length === 0) return false
      const list = Array.isArray(code) ? code : [code]
      return list.some((c) => perms.includes(c))
    },
    /** 角色判断：admin 全通过 */
    hasRole: (state) => (codes: string | string[]) => {
      const roles = state.profile?.roles ?? []
      if (roles.includes('admin')) return true
      const list = Array.isArray(codes) ? codes : [codes]
      return list.some((c) => roles.includes(c))
    },
  },

  actions: {
    async login(username: string, password: string) {
      this.loading = true
      try {
        const res = await authApi.login({ username, password })
        this.token = res.accessToken
        this.profile = res.user
        setToken(res.accessToken)
        return res
      } finally {
        this.loading = false
      }
    },

    /** 拉取当前用户信息（刷新页面后恢复状态） */
    async fetchProfile() {
      if (!this.token) return null
      const res = await authApi.profile()
      this.profile = res
      return res
    },

    async logout() {
      try {
        await authApi.logout()
      } catch {
        // 无状态 JWT，忽略退出接口异常
      }
      this.reset()
    },

    reset() {
      this.token = ''
      this.profile = null
      clearToken()
    },

    async changePassword(oldPassword: string, newPassword: string) {
      await authApi.changePassword({ oldPassword, newPassword })
      this.reset()
    },
  },
})