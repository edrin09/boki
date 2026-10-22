import { Logger } from '@nestjs/common'

/**
 * JWT 配置读取
 * 注意：必须通过函数在运行时读取，避免 .env 尚未加载导致密钥与签发时不一致。
 */

const DEV_FALLBACK_SECRET = 'boki-dev-secret'
let warned = false

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (secret) return secret

  // 打包版由 Electron 壳注入随机密钥，正常不会走到这里；
  // 若走到，说明是直接手跑 dist/main.js，局域网部署下默认密钥可被伪造 token。
  if (!warned) {
    warned = true
    new Logger('JWT').warn(
      `未设置 JWT_SECRET，正在使用开发默认密钥。局域网部署前请务必配置 JWT_SECRET（打包版会自动注入随机密钥）。`,
    )
  }
  return DEV_FALLBACK_SECRET
}

export function getJwtExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN || '8h'
}