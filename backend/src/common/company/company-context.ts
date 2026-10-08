import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * 当前请求的记账公司上下文。
 *
 * 多公司记账的隔离依赖它：所有业务仓储在读写时都会从这里取 companyId，
 * 自动追加 `company_id = ?` 过滤条件（见 company.repository.ts）。
 */
export interface CompanyContextStore {
  companyId: string
  companyName?: string
  userId?: string
}

const storage = new AsyncLocalStorage<CompanyContextStore>()

/** 在指定公司上下文中执行（由 CompanyScopeInterceptor 调用） */
export function runWithCompany<T>(store: CompanyContextStore, fn: () => T): T {
  return storage.run(store, fn)
}

/** 读取当前上下文（可能为空：登录、系统初始化等无公司场景） */
export function getCompanyContext(): CompanyContextStore | undefined {
  return storage.getStore()
}

/**
 * 取当前公司ID。
 * 缺失即意味着代码在错误的调用路径上（未经过拦截器），直接抛错避免误查全表。
 */
export function requireCompanyId(): string {
  const store = storage.getStore()
  if (!store?.companyId) {
    throw new Error('当前请求没有记账公司上下文，请检查 CompanyScopeInterceptor 是否生效')
  }
  return store.companyId
}