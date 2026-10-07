/** 菜单项定义 */
export interface MenuNode {
  title: string
  icon?: string
  /** 叶子菜单的路由地址 */
  path?: string
  /** 访问所需权限标识 */
  permission?: string
  children?: MenuNode[]
}

/**
 * 侧边菜单（与业务路由对应）
 * 前端按用户权限过滤后展示
 */
export const MENUS: MenuNode[] = [
  {
    title: '工作台',
    icon: 'HomeFilled',
    path: '/dashboard',
    permission: 'dashboard',
  },
  {
    title: '凭证管理',
    icon: 'Tickets',
    permission: 'voucher',
    children: [
      { title: '凭证列表', path: '/voucher/list', permission: 'voucher:list' },
      { title: '凭证录入', path: '/voucher/create', permission: 'voucher:create' },
    ],
  },
  {
    title: '资金往来',
    icon: 'Money',
    permission: 'cash',
    children: [
      { title: '现金银行', path: '/cash-bank', permission: 'cash-bank' },
      { title: '应收应付', path: '/ar-ap', permission: 'ar-ap' },
      { title: '其他收支', path: '/income-expense', permission: 'income-expense' },
    ],
  },
  {
    title: '账簿查询',
    icon: 'Notebook',
    permission: 'books',
    children: [
      { title: '总账', path: '/books/ledger', permission: 'books:ledger' },
      { title: '明细账', path: '/books/sub-ledger', permission: 'books:sub-ledger' },
      { title: '科目余额表', path: '/books/balance', permission: 'books:balance' },
      { title: '试算平衡表', path: '/books/trial-balance', permission: 'books:trial-balance' },
    ],
  },
  {
    title: '薪酬报销',
    icon: 'UserFilled',
    permission: 'hr',
    children: [
      { title: '员工管理', path: '/hr/employees', permission: 'hr:employee' },
      { title: '报销单', path: '/hr/expense-claims', permission: 'hr:expense-claim' },
      { title: '工资表', path: '/hr/payrolls', permission: 'hr:payroll' },
    ],
  },
  {
    title: '票据智能记账',
    icon: 'Camera',
    permission: 'receipts',
    children: [
      { title: '票据列表', path: '/receipts/list', permission: 'receipt:list' },
      { title: '待确认工作台', path: '/receipts/workbench', permission: 'receipts:workbench' },
      { title: '归类规则', path: '/receipts/rules', permission: 'receipts:rules' },
    ],
  },
  {
    title: '财务报表',
    icon: 'DataAnalysis',
    permission: 'reports',
    children: [
      { title: '资产负债表', path: '/reports/balance-sheet', permission: 'reports:balance-sheet' },
      { title: '利润表', path: '/reports/profit-loss', permission: 'reports:profit-loss' },
      { title: '票据台账', path: '/reports/ledger', permission: 'reports:ledger' },
      { title: '现金流量简表', path: '/reports/cash-flow', permission: 'reports:cash-flow' },
      { title: '费用结构分析', path: '/reports/expense-analysis', permission: 'reports:expense-analysis' },
      { title: '一键月结', path: '/reports/monthly-close', permission: 'reports:monthly-close' },
    ],
  },
  {
    title: '基础资料',
    icon: 'FolderOpened',
    permission: 'settings',
    children: [
      { title: '会计科目', path: '/settings/accounts', permission: 'settings:account' },
      { title: '往来单位', path: '/settings/partners', permission: 'settings:partner' },
      { title: '资金账户', path: '/settings/banks', permission: 'settings:bank' },
      { title: '部门管理', path: '/settings/departments', permission: 'settings:department' },
      { title: '项目管理', path: '/settings/projects', permission: 'settings:project' },
      { title: '期初余额', path: '/settings/initial-balance', permission: 'settings:initial-balance' },
      { title: '公司信息', path: '/settings/company', permission: 'settings:company' },
    ],
  },
  {
    title: '系统管理',
    icon: 'Setting',
    permission: 'system',
    children: [
      { title: '用户管理', path: '/system/users', permission: 'system:user' },
      { title: '角色管理', path: '/system/roles', permission: 'system:role' },
      { title: '权限管理', path: '/system/permissions', permission: 'system:permission' },
      { title: '操作日志', path: '/system/logs', permission: 'system:log' },
      { title: '数据备份', path: '/system/backup', permission: 'system:backup' },
    ],
  },
]

/** 按权限过滤菜单（移除无权限项及空分组） */
export function filterMenus(menus: MenuNode[], permissions: string[]): MenuNode[] {
  const result: MenuNode[] = []

  for (const menu of menus) {
    if (menu.permission && !permissions.includes(menu.permission)) continue

    if (menu.children?.length) {
      const children = menu.children.filter(
        (child) => !child.permission || permissions.includes(child.permission),
      )
      if (children.length === 0) continue
      result.push({ ...menu, children })
    } else if (menu.path) {
      result.push(menu)
    }
  }

  return result
}