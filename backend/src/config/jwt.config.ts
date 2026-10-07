/**
 * JWT 配置读取
 * 注意：必须通过函数在运行时读取，避免 .env 尚未加载导致密钥与签发时不一致。
 */
export function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'financial-bs-dev-secret'
}

export function getJwtExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN || '8h'
}