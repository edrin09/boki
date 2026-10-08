import { defineStore } from 'pinia'
import { accountApi, bankApi, departmentApi, partnerApi, projectApi } from '@/api'

/** 可刷新的档案类型 */
export type BasicKind = 'accounts' | 'partners' | 'banks' | 'departments' | 'projects'

interface OptionItem {
  id: string
  code?: string
  name: string
  [key: string]: any
}

/**
 * 基础档案缓存：科目、往来单位、资金账户、部门、项目
 * 页面首次使用时按需加载，避免启动时大量请求
 */
export const useBasicStore = defineStore('basic', {
  state: () => ({
    accounts: [] as OptionItem[],
    partners: [] as OptionItem[],
    banks: [] as OptionItem[],
    departments: [] as OptionItem[],
    projects: [] as OptionItem[],
    loaded: {
      accounts: false,
      partners: false,
      banks: false,
      departments: false,
      projects: false,
    },
  }),

  getters: {
    /** 明细科目（可记账） */
    leafAccounts: (state) => state.accounts,
    /** 现金/银行科目 */
    cashAccounts: (state) => state.accounts.filter((a) => a.isCash || a.isBank),
    /** 损益类科目 */
    profitAccounts: (state) => state.accounts.filter((a) => a.category === 'profit'),
    /** 资产类科目 */
    assetAccounts: (state) => state.accounts.filter((a) => a.category === 'asset'),
    /** 负债类科目 */
    liabilityAccounts: (state) => state.accounts.filter((a) => a.category === 'liability'),
    /** 权益类科目 */
    equityAccounts: (state) => state.accounts.filter((a) => a.category === 'equity'),
    /** 现金类资金账户 */
    cashBanks: (state) => state.banks.filter((b) => b.type === 'cash'),
  },

  actions: {
    async loadAccounts(force = false) {
      if (this.loaded.accounts && !force) return
      this.accounts = await accountApi.options()
      this.loaded.accounts = true
    },

    async loadPartners(force = false) {
      if (this.loaded.partners && !force) return
      this.partners = await partnerApi.options()
      this.loaded.partners = true
    },

    async loadBanks(force = false) {
      if (this.loaded.banks && !force) return
      this.banks = await bankApi.options()
      this.loaded.banks = true
    },

    async loadDepartments(force = false) {
      if (this.loaded.departments && !force) return
      this.departments = await departmentApi.options()
      this.loaded.departments = true
    },

    async loadProjects(force = false) {
      if (this.loaded.projects && !force) return
      this.projects = await projectApi.options()
      this.loaded.projects = true
    },

    async loadAll() {
      await Promise.all([
        this.loadAccounts(),
        this.loadPartners(),
        this.loadBanks(),
        this.loadDepartments(),
        this.loadProjects(),
      ])
    },

    /** 档案变更后刷新指定类型 */
    async refresh(kind: BasicKind) {
      if (kind === 'accounts') return this.loadAccounts(true)
      if (kind === 'partners') return this.loadPartners(true)
      if (kind === 'banks') return this.loadBanks(true)
      if (kind === 'departments') return this.loadDepartments(true)
      return this.loadProjects(true)
    },

    /**
     * 清空全部档案缓存。
     *
     * 切换记账公司后必须调用：档案按公司隔离，
     * 沿用上一个公司的数据会导致下拉框串账。
     */
    reset() {
      this.accounts = []
      this.partners = []
      this.banks = []
      this.departments = []
      this.projects = []
      this.loaded = {
        accounts: false,
        partners: false,
        banks: false,
        departments: false,
        projects: false,
      }
    },
  },
})