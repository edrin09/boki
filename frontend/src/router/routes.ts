import type { RouteRecordRaw } from 'vue-router'

const AppLayout = () => import('@/components/layout/AppLayout.vue')

/**
 * 静态路由：登录页、错误页（无需权限）
 */
export const constantRoutes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '登录', public: true },
  },
  {
    path: '/setup-company',
    name: 'SetupCompany',
    component: () => import('@/views/setup-company/index.vue'),
    meta: { title: '创建记账公司' },
  },
  {
    path: '/403',
    name: 'Forbidden',
    component: () => import('@/views/error/403.vue'),
    meta: { title: '无访问权限', public: true },
  },
  {
    path: '/',
    redirect: '/voucher/list',
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/error/404.vue'),
    // 注意：不可标记 public，否则未登录访问未挂载的业务路由时会直接渲染 404 而跳过登录跳转
    meta: { title: '页面不存在' },
  },
]

/**
 * 业务路由：按用户权限动态挂载
 * 顶层统一使用 AppLayout，children 承载具体页面
 */
export const businessRoutes: RouteRecordRaw[] = [
  // ============ 凭证管理 ============
  {
    path: '/voucher',
    component: AppLayout,
    redirect: '/voucher/list',
    meta: { title: '凭证管理', permission: 'voucher' },
    children: [
      {
        path: 'list',
        name: 'VoucherList',
        component: () => import('@/views/voucher/list/index.vue'),
        meta: { title: '凭证列表', permission: 'voucher:list' },
      },
      {
        path: 'create',
        name: 'VoucherCreate',
        component: () => import('@/views/voucher/create/index.vue'),
        meta: { title: '手动录入', permission: 'voucher:create' },
      },
    ],
  },

  // ============ 账簿查询 ============
  {
    path: '/books',
    component: AppLayout,
    redirect: '/books/ledger',
    meta: { title: '账簿查询', permission: 'books' },
    children: [
      { path: '', redirect: '/books/ledger' },
      {
        path: 'ledger',
        name: 'BooksLedger',
        component: () => import('@/views/books/ledger/index.vue'),
        meta: { title: '总账', permission: 'books:ledger' },
      },
      {
        path: 'sub-ledger',
        name: 'BooksSubLedger',
        component: () => import('@/views/books/sub-ledger/index.vue'),
        meta: { title: '明细账', permission: 'books:sub-ledger' },
      },
      {
        path: 'balance',
        name: 'BooksBalance',
        component: () => import('@/views/books/balance/index.vue'),
        meta: { title: '科目余额表', permission: 'books:balance' },
      },
      {
        path: 'trial-balance',
        name: 'BooksTrialBalance',
        component: () => import('@/views/books/trial-balance/index.vue'),
        meta: { title: '试算平衡表', permission: 'books:trial-balance' },
      },
    ],
  },

  // ============ 基础资料 ============
  {
    path: '/settings',
    component: AppLayout,
    redirect: '/settings/accounts',
    meta: { title: '基础资料', permission: 'settings' },
    children: [
      { path: '', redirect: '/settings/accounts' },
      {
        path: 'accounts',
        name: 'SettingAccounts',
        component: () => import('@/views/settings/accounts/index.vue'),
        meta: { title: '会计科目', permission: 'settings:account' },
      },
      {
        path: 'partners',
        name: 'SettingPartners',
        component: () => import('@/views/settings/partners/index.vue'),
        meta: { title: '往来单位', permission: 'settings:partner' },
      },
      {
        path: 'initial-balance',
        name: 'SettingInitialBalance',
        component: () => import('@/views/settings/initial-balance/index.vue'),
        meta: { title: '期初余额', permission: 'settings:initial-balance' },
      },
      {
        path: 'company',
        name: 'SettingCompany',
        component: () => import('@/views/settings/company.vue'),
        meta: { title: '公司信息', permission: 'settings:company' },
      },
    ],
  },

  // ============ 系统管理 ============
  {
    path: '/system',
    component: AppLayout,
    // 用户/角色/权限页面已迁入 iam 插件，内核兜底指向操作日志
    redirect: '/system/logs',
    meta: { title: '系统管理', permission: 'system' },
    children: [
      { path: '', redirect: '/system/logs' },
      {
        path: 'logs',
        name: 'SystemLogs',
        component: () => import('@/views/system/logs/index.vue'),
        meta: { title: '操作日志', permission: 'system:log' },
      },
      {
        path: 'backup',
        name: 'SystemBackup',
        component: () => import('@/views/system/backup/index.vue'),
        meta: { title: '数据备份', permission: 'system:backup' },
      },
      {
        path: 'plugins',
        name: 'SystemPlugins',
        component: () => import('@/views/system/plugins/index.vue'),
        meta: { title: '插件市场', permission: 'system:plugin' },
      },
      {
        path: 'profile',
        name: 'SystemProfile',
        component: () => import('@/views/system/profile/index.vue'),
        meta: { title: '个人中心' },
      },
    ],
  },
]
