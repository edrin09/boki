import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import type { CurrentUser, JwtPayload } from '../../common/interfaces/jwt-payload.interface'
import { getJwtSecret } from '../../config/jwt.config'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
    })
  }

  /**
   * passport-jwt 只把载荷原样挂到 request.user，不会补 `id`。
   *
   * 业务侧统一用 `user.id`（审计操作人、一次性令牌的「绑人」校验等），
   * 早先直接 `return payload` 会让 `user.id` 恒为 undefined ——
   * 令牌归属校验退化成 `undefined === undefined`，任何人都能替别人确认指令。
   * 这里显式由 `sub` 派生 `id`，`sub` 原样保留（建账等入口仍在用它）。
   */
  validate(payload: JwtPayload): CurrentUser {
    return { ...payload, id: payload.sub }
  }
}
