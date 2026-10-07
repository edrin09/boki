import { Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

/**
 * JWT 认证守卫（默认全局生效）
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

/**
 * 本地登录守卫（仅用于登录接口）
 */
@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}