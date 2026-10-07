import type { Request } from 'express'
import type { CurrentUser } from '../interfaces/jwt-payload.interface'

/**
 * 从请求中获取当前登录用户（由 JwtStrategy.validate 注入）
 */
export function getCurrentUser(req: Request): CurrentUser {
  const user = (req as unknown as { user?: CurrentUser }).user
  if (!user) {
    throw new Error('未获取到当前登录用户')
  }
  return user
}

/**
 * 安全获取当前登录用户（不抛异常）
 */
export function tryGetCurrentUser(req: Request): CurrentUser | null {
  return (req as unknown as { user?: CurrentUser }).user ?? null
}