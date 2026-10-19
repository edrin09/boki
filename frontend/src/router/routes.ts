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
    redirect: '/dashboard',
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
  {
    path: '/dashboard',
    component: AppLayout,
    meta: { title: '工作台', permission: 'dashboard' },
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/index.vue'),
        meta: { title: '工作台' },
      },
    ],
  },

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

  // ============ 资金往来 ============
  {
    path: '/cash',
    component: AppLayout,
    redirect: '/cash-bank',
    meta: { title: '资金往来', permission: 'cash' },
    children: [
      { path: '', redirect: '/cash-bank' },
      {
        path: '/cash-bank',
        name: 'CashBank',
        component: () => import('@/views/cash-bank/index.vue'),
        meta: { title: '现金银行', permission: 'cash-bank' },
      },
      {
        path: '/ar-ap',
        name: 'ArAp',
        component: () => import('@/views/ar-ap/index.vue'),
        meta: { title: '应收应付', permission: 'ar-ap' },
      },
      {
        path: '/income-expense',
        name: 'IncomeExpense',
        component: () => import('@/views/income-expense/index.vue'),
        meta: { title: '其他收支', permission: 'income-expense' },
      },
      {
        path: '/cash/fixed-expense',
        name: 'FixedExpense',
        component: () => import('@/views/fixed-expense/index.vue'),
        meta: { title: '固定费用', permission: 'fixed-expense' },
      },
      {
        path: '/cash/bank-stmt',
        name: 'BankStmt',
        component: () => import('@/views/cash-bank/bank-stmt.vue'),
        meta: { title: '银行流水', permission: 'bank-stmt' },
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

  // ============ 薪酬报销 ============
  {
    path: '/hr',
    component: AppLayout,
    redirect: '/hr/employees',
    meta: { title: '薪酬报销', permission: 'hr' },
    children: [
      { path: '', redirect: '/hr/employees' },
      {
        path: 'employees',
        name: 'HrEmployees',
        component: () => import('@/views/hr/employees/index.vue'),
        meta: { title: '员工管理', permission: 'hr:employee' },
      },
      {
        path: 'expense-claims',
        name: 'HrExpenseClaims',
        component: () => import('@/views/hr/expense-claims/index.vue'),
        meta: { title: '报销单', permission: 'hr:expense-claim' },
      },
      {
        path: 'loans',
        name: 'HrLoans',
        component: () => import('@/views/hr/loans/index.vue'),
        meta: { title: '借款单', permission: 'hr:loan' },
      },
      {
        path: 'payrolls',
        name: 'HrPayrolls',
        component: () => import('@/views/hr/payrolls/index.vue'),
        meta: { title: '工资表', permission: 'hr:payroll' },
      },
      {
        path: 'payrolls/:id/edit',
        name: 'HrPayrollEdit',
        component: () => import('@/views/hr/payrolls/edit.vue'),
        meta: { title: '编辑工资明细', permission: 'hr:payroll:update', activeMenu: '/hr/payrolls' },
      },
    ],
  },

  // ============ 票据智能记账 ============
  {
    path: '/receipts',
    component: AppLayout,
    redirect: '/receipts/workbench',
    meta: { title: 'AI 智能记账', permission: 'receipts' },
    children: [
      { path: '', redirect: '/receipts/workbench' },
      {
        path: 'list',
        name: 'ReceiptList',
        component: () => import('@/views/receipts/list.vue'),
        meta: { title: '票据列表', permission: 'receipt:list' },
      },
      {
        path: 'workbench',
        name: 'ReceiptWorkbench',
        component: () => import('@/views/receipts/workbench.vue'),
        meta: { title: '上传记账', permission: 'receipts:workbench' },
      },
      {
        path: 'rules',
        name: 'ReceiptRules',
        component: () => import('@/views/receipts/rules.vue'),
        meta: { title: '归类规则', permission: 'receipts:rules' },
      },
    ],
  },

  // ============ 财务报表 ============
  {
    path: '/reports',
    component: AppLayout,
    redirect: '/reports/balance-sheet',
    meta: { title: '财务报表', permission: 'reports' },
    children: [
      { path: '', redirect: '/reports/balance-sheet' },
      {
        path: 'balance-sheet',
        name: 'ReportBalanceSheet',
        component: () => import('@/views/reports/balance-sheet/index.vue'),
        meta: { title: '资产负债表', permission: 'reports:balance-sheet' },
      },
      {
        path: 'profit-loss',
        name: 'ReportProfitLoss',
        component: () => import('@/views/reports/profit-loss/index.vue'),
        meta: { title: '利润表', permission: 'reports:profit-loss' },
      },
      {
        path: 'ledger',
        name: 'ReportLedger',
        component: () => import('@/views/reports/ledger.vue'),
        meta: { title: '票据台账', permission: 'reports:ledger' },
      },
      {
        path: 'cash-flow',
        name: 'ReportCashFlow',
        component: () => import('@/views/reports/cash-flow.vue'),
        meta: { title: '现金流量简表', permission: 'reports:cash-flow' },
      },
      {
        path: 'expense-analysis',
        name: 'ReportExpenseAnalysis',
        component: () => import('@/views/reports/expense-analysis.vue'),
        meta: { title: '费用结构分析', permission: 'reports:expense-analysis' },
      },
      {
        path: 'monthly-close',
        name: 'ReportMonthlyClose',
        component: () => import('@/views/reports/monthly-close.vue'),
        meta: { title: '一键月结', permission: 'reports:monthly-close' },
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
        path: 'banks',
        name: 'SettingBanks',
        component: () => import('@/views/settings/banks/index.vue'),
        meta: { title: '资金账户', permission: 'settings:bank' },
      },
      {
        path: 'departments',
        name: 'SettingDepartments',
        component: () => import('@/views/settings/departments/index.vue'),
        meta: { title: '部门管理', permission: 'settings:department' },
      },
      {
        path: 'projects',
        name: 'SettingProjects',
        component: () => import('@/views/settings/projects/index.vue'),
        meta: { title: '项目管理', permission: 'settings:project' },
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
      {
        path: 'companies',
        name: 'SettingCompanies',
        component: () => import('@/views/system/companies/index.vue'),
        meta: { title: '记账公司', permission: 'settings:company-manage' },
      },
    ],
  },

  // ============ 系统管理 ============
  {
    path: '/system',
    component: AppLayout,
    redirect: '/system/users',
    meta: { title: '系统管理', permission: 'system' },
    children: [
      { path: '', redirect: '/system/users' },
      {
        path: 'companies',
        name: 'SystemCompanies',
        component: () => import('@/views/system/companies/index.vue'),
        meta: { title: '记账公司', permission: 'system:company' },
      },
      {
        path: 'users',
        name: 'SystemUsers',
        component: () => import('@/views/system/users/index.vue'),
        meta: { title: '用户管理', permission: 'system:user' },
      },
      {
        path: 'roles',
        name: 'SystemRoles',
        component: () => import('@/views/system/roles/index.vue'),
        meta: { title: '角色管理', permission: 'system:role' },
      },
      {
        path: 'permissions',
        name: 'SystemPermissions',
        component: () => import('@/views/system/permissions/index.vue'),
        meta: { title: '权限管理', permission: 'system:permission' },
      },
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
        path: 'ai',
        name: 'SystemAiConfig',
        component: () => import('@/views/system/ai.vue'),
        meta: { title: 'AI模型设置', permission: 'system:ai-config' },
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
