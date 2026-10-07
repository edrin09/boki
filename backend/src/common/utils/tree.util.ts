/**
 * 通用树构建工具
 */
export interface TreeNode {
  id: string
  parentId?: string | null
  [key: string]: any
}

export interface TreeOptions {
  /** 子节点字段名，默认 children */
  childrenKey?: string
  /** 根节点 parentId 判定值，默认 null */
  rootParentId?: string | null
}

/**
 * 由扁平列表构建树
 */
export function buildTree<T extends TreeNode>(list: T[], options: TreeOptions = {}): any[] {
  const childrenKey = options.childrenKey ?? 'children'
  const rootParentId = options.rootParentId ?? null

  const map = new Map<string, any>()
  for (const item of list) {
    map.set(item.id, { ...item, [childrenKey]: [] })
  }

  const roots: any[] = []
  for (const item of list) {
    const node = map.get(item.id)
    const pid = item.parentId ?? null
    if (pid && pid !== rootParentId && map.has(pid)) {
      map.get(pid)[childrenKey].push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

/**
 * 递归收集某个节点及其所有子孙节点的 ID
 */
export function collectDescendantIds<T extends TreeNode>(list: T[], id: string): Set<string> {
  const result = new Set<string>()
  const walk = (parentId: string) => {
    for (const item of list) {
      if ((item.parentId ?? null) === parentId && !result.has(item.id)) {
        result.add(item.id)
        walk(item.id)
      }
    }
  }
  walk(id)
  return result
}

/**
 * 从树中摘除指定节点及其所有子孙（用于删除前校验）
 */
export function flattenTree(nodes: any[], childrenKey = 'children'): any[] {
  const result: any[] = []
  const walk = (list: any[]) => {
    for (const node of list) {
      result.push(node)
      if (Array.isArray(node[childrenKey]) && node[childrenKey].length) walk(node[childrenKey])
    }
  }
  walk(nodes)
  return result
}

/**
 * 树排序（按 sort 字段升序，null 视为 0）
 */
export function sortTree<T extends { sort?: number | null }>(nodes: T[], childrenKey = 'children'): T[] {
  nodes.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
  for (const node of nodes) {
    const children = (node as any)[childrenKey]
    if (Array.isArray(children) && children.length) sortTree(children, childrenKey)
  }
  return nodes
}