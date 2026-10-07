/**
 * JWT 载荷
 */
export interface JwtPayload {
  /** 用户ID */
  sub: string
  username: string
  nickname: string
  /** 角色标识列表 */
  roles: string[]
  /** 权限标识列表 */
  permissions: string[]
  iat?: number
  exp?: number
}

/**
 * 当前登录用户（挂载到 request.user）
 */
export interface CurrentUser extends JwtPayload {
  id: string
}