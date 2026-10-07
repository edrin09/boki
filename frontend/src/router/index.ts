import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { constantRoutes, businessRoutes } from './routes'
import { getToken } from '@/api'
import { useUserStore } from '@/stores/user'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [...constantRoutes] as RouteRecordRaw[],
  scrollBehavior: () => ({ top: 0 }),
})

/** 业务路由是否已挂载 */
let businessMounted = false

/** 按当前用户权限过滤业务路由 */
function filterRoutes(routes: RouteRecordRaw[], permissions: string[]): RouteRecordRaw[] {
  const result: RouteRecordRaw[] = []
  for (const route of routes) {
    const meta = route.meta as { permission?: string; title?: string } | undefined
    const required = meta?.permission

    if (required && !permissions.includes(required)) continue

    const cloned: RouteRecordRaw = { ...route }
    if (route.children?.length) {
      const children = filterRoutes(route.children, permissions)
      // 所有子路由都被过滤掉时，父级菜单不展示
      if (children.length === 0) continue
      cloned.children = children
    }
    result.push(cloned)
  }
  return result
}

/** 挂载业务路由（登录后调用一次） */
export function mountBusinessRoutes(): void {
  if (businessMounted) return
  const userStore = useUserStore()
  const permissions = userStore.profile?.permissions ?? []
  const routes = filterRoutes(businessRoutes, permissions)
  routes.forEach((route) => router.addRoute(route))
  businessMounted = true
}

export function resetBusinessRoutes(): void {
  businessMounted = false
}

/** 首个可访问的路径 */
export function firstAccessiblePath(permissions: string[]): string {
  for (const route of filterRoutes(businessRoutes, permissions)) {
    if (route.path === '/dashboard') return route.path
    const child = route.children?.find((c) => !c.path.startsWith('/'))
    if (child?.path) return `${route.path}/${child.path}`.replace(/\/+/g, '/')
    if (route.path.startsWith('/')) return route.path
  }
  return '/403'
}

router.beforeEach(async (to, _from, next) => {
  const title = (to.meta?.title as string) || ''
  document.title = title ? `${title} - 简易财务软件` : '简易财务软件'

  const token = getToken()

  if (to.meta?.public) {
    if (to.path === '/login' && token) {
      const userStore = useUserStore()
      if (!userStore.profile) {
        try {
          await userStore.fetchProfile()
        } catch {
          userStore.reset()
        }
      }
      if (userStore.isLoggedIn) {
        mountBusinessRoutes()
        return next(userStore.profile?.permissions ? firstAccessiblePath(userStore.profile.permissions) : '/403')
      }
    }
    return next()
  }

  if (!token) {
    return next({ path: '/login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : undefined })
  }

  const userStore = useUserStore()

  if (!userStore.profile) {
    try {
      await userStore.fetchProfile()
    } catch {
      userStore.reset()
      return next({ path: '/login' })
    }
  }

  if (!businessMounted) {
    mountBusinessRoutes()
    // 必须按 path 重新解析：此时 to 可能仍指向 404 兜底路由（name=NotFound），
    // 若沿用 to.name 会再次命中 NotFound 而无法进入真实页面。
    return next({ path: to.path, query: to.query, hash: to.hash, replace: true })
  }

  // 权限校验
  const required = to.meta?.permission as string | undefined
  if (required && !userStore.hasPermission(required)) {
    return next('/403')
  }

  return next()
})

export default router