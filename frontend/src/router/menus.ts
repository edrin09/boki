import type { PluginMenuContribution } from '@/plugins/types'

/** 菜单项定义 */
export interface MenuNode {
  title: string
  icon?: string
  /** 内核分组标识，插件菜单按此挂载 */
  group?: string
  /** 单页分组：插件贡献同组菜单时直接补全本节点，不再生成「分组 > 页面」两级 */
  single?: boolean
  /** 叶子菜单的路由地址 */
  path?: string
  /** 访问所需权限标识 */
  permission?: string
  children?: MenuNode[]
}

/** 内核分组的默认标题（插件只给 group、且分组不存在时使用） */
const GROUP_TITLES: Record<string, string> = {
  dashboard: '工作台',
  receipts: 'AI 智能记账',
  voucher: '凭证管理',
  cash: '资金往来',
  books: '账簿查询',
  hr: '薪酬报销',
  reports: '财务报表',
  settings: '基础资料',
  system: '系统管理',
  // 兼容旧版 ai 插件（<=1.0.1，菜单独立分组）；1.0.2 起挂入系统管理
  ai: 'AI模型设置',
}

/**
 * 侧边菜单（与业务路由对应）
 * 前端按用户权限过滤后展示
 */
export const MENUS: MenuNode[] = [
  {
    title: '工作台',
    icon: 'HomeFilled',
    // 单页入口由 report-pack 插件贡献（dashboard 不是内核页面）
    group: 'dashboard',
    single: true,
  },
  {
    title: 'AI 智能记账',
    icon: 'MagicStick',
    group: 'receipts',
    permission: 'receipts',
    children: [],
  },
  {
    title: '凭证管理',
    icon: 'Tickets',
    group: 'voucher',
    permission: 'voucher',
    children: [
      { title: '凭证列表', path: '/voucher/list', permission: 'voucher:list' },
      { title: '手动录入', path: '/voucher/create', permission: 'voucher:create' },
    ],
  },
  {
    title: '资金往来',
    icon: 'Money',
    group: 'cash',
    permission: 'cash',
    children: [],
  },
  {
    title: '账簿查询',
    icon: 'Notebook',
    group: 'books',
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
    group: 'hr',
    permission: 'hr',
    children: [],
  },
  {
    title: '财务报表',
    icon: 'DataAnalysis',
    group: 'reports',
    permission: 'reports',
    children: [],
  },
  {
    title: '基础资料',
    icon: 'FolderOpened',
    group: 'settings',
    permission: 'settings',
    children: [
      { title: '会计科目', path: '/settings/accounts', permission: 'settings:account' },
      { title: '往来单位', path: '/settings/partners', permission: 'settings:partner' },
      { title: '期初余额', path: '/settings/initial-balance', permission: 'settings:initial-balance' },
      { title: '公司信息', path: '/settings/company', permission: 'settings:company' },
    ],
  },
  {
    title: '系统管理',
    icon: 'Setting',
    group: 'system',
    permission: 'system',
    children: [
      { title: '插件市场', path: '/system/plugins', permission: 'system:plugin' },
      { title: '操作日志', path: '/system/logs', permission: 'system:log' },
      { title: '数据备份', path: '/system/backup', permission: 'system:backup' },
    ],
  },
]

function toMenuNode(item: PluginMenuContribution): MenuNode {
  return {
    title: item.title,
    icon: item.icon,
    path: item.path,
    permission: item.permission,
    children: item.children?.map(toMenuNode),
  }
}

/**
 * 合并插件菜单。
 *
 * - 带 `group` 的条目挂到对应内核分组下（分组不存在时按默认标题创建）
 * - 不带 `group` 的条目作为完整菜单树追加
 */
export function mergePluginMenus(
  base: MenuNode[],
  contributions: PluginMenuContribution[],
): MenuNode[] {
  const result: MenuNode[] = base.map((item) => ({
    ...item,
    children: item.children ? [...item.children] : undefined,
  }))

  for (const contribution of contributions) {
    const node = toMenuNode(contribution)
    if (contribution.group) {
      let group = result.find((item) => item.group === contribution.group)
      if (!group) {
        group = {
          title: GROUP_TITLES[contribution.group] ?? contribution.group,
          group: contribution.group,
          children: [],
        }
        result.push(group)
      }
      // 单页分组（如 dashboard）：补全分组节点，避免出现「工作台 > 工作台」
      if (group.single && !group.path && node.path && !node.children?.length) {
        group.path = node.path
        group.permission = node.permission
        group.title = node.title
        group.icon = group.icon ?? node.icon
        continue
      }
      const children = group.children ?? (group.children = [])
      if (node.children?.length) {
        for (const child of node.children) {
          if (child.path && children.some((c) => c.path === child.path)) continue
          children.push(child)
        }
      } else if (!node.path || !children.some((c) => c.path === node.path)) {
        children.push(node)
      }
      continue
    }

    if (node.path && result.some((item) => item.path === node.path)) continue
    result.push(node)
  }

  return result
}

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