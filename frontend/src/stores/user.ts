import { defineStore } from 'pinia'
import { authApi, clearToken, getToken, setToken, type CompanyBrief } from '@/api'

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
  /** 当前记账公司ID */
  companyId?: string | null
  /** 当前记账公司 */
  company?: CompanyBrief | null
  /** 可管理的公司列表 */
  companies?: CompanyBrief[]
}

export const useUserStore = defineStore('user', {
  state: () => ({
    token: getToken() ?? '',
    profile: null as UserProfile | null,
    loading: false,
    switching: false,
  }),

  getters: {
    isLoggedIn: (state) => !!state.token,
    isAdmin: (state) => state.profile?.roles?.includes('admin') ?? false,
    nickname: (state) => state.profile?.nickname ?? '',
    /** 当前记账公司ID */
    companyId: (state) => state.profile?.companyId ?? '',
    /** 当前记账公司 */
    currentCompany: (state) => state.profile?.company ?? null,
    /** 可管理的公司（用于切换器） */
    companies: (state) => state.profile?.companies ?? [],
    companyName: (state) => state.profile?.company?.name ?? '',
    /** 多公司时（可管理 1 家以上）才展示切换入口 */
    canSwitchCompany: (state) => (state.profile?.companies?.length ?? 0) > 1,
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
        this.applyResult(res)
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

    /**
     * 切换记账公司。
     *
     * 后端为隔离边界重新签发带 companyId 的令牌，
     * 因此切换后必须整体刷新，避免残留上一个公司的缓存数据。
     */
    async switchCompany(companyId: string) {
      if (!companyId || companyId === this.companyId) return null
      this.switching = true
      try {
        const res = await authApi.switchCompany(companyId)
        this.applyResult(res)
        return res
      } finally {
        this.switching = false
      }
    },

    /** 应用登录/切换公司的返回结果 */
    applyResult(res: {
      accessToken: string
      user: any
      company: CompanyBrief | null
      companies: CompanyBrief[]
    }) {
      this.token = res.accessToken
      setToken(res.accessToken)
      this.profile = {
        ...(this.profile ?? {}),
        ...res.user,
        companyId: res.company?.id ?? null,
        company: res.company,
        companies: res.companies ?? [],
      }
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
      this.switching = false
      clearToken()
    },

    async changePassword(oldPassword: string, newPassword: string) {
      await authApi.changePassword({ oldPassword, newPassword })
      this.reset()
    },
  },
})