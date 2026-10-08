/**
 * JWT 载荷
 */
export interface JwtPayload {
  /** 用户ID */
  sub: string
  username: string
  nickname: string
  /**
   * 当前记账公司ID（多公司隔离的关键）。
   * 切换公司会重新签发令牌，因此该值由服务端签名保证不可伪造。
   */
  companyId?: string
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