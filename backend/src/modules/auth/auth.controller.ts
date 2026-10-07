import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common'
import type { Request } from 'express'
import { AuthService } from './auth.service'
import { LoginDto, ChangePasswordDto } from './dto/auth.dto'
import { SkipWrap } from '../../common/decorators/skip-wrap.decorator'
import { Operation } from '../../common/decorators/operation.decorator'
import { Public } from '../../common/decorators/public.decorator'
import { getCurrentUser } from '../../common/utils/request.util'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 登录
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @SkipWrap()
  @Public()
  @Operation('用户登录')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip
    const result = await this.authService.login(dto, ip)
    return {
      code: 0,
      message: '登录成功',
      data: result,
      timestamp: Date.now(),
    }
  }

  /**
   * 当前登录用户信息
   */
  @Get('profile')
  @Operation('获取当前用户信息')
  profile(@Req() req: Request) {
    return this.authService.profile(getCurrentUser(req).sub)
  }

  /**
   * 退出登录（JWT 无状态，仅记录，前端清除 token）
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @Operation('退出登录')
  logout() {
    return { message: '已退出登录' }
  }

  /**
   * 修改本人密码
   */
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @Operation('修改密码')
  async changePassword(@Req() req: Request, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(getCurrentUser(req).sub, dto)
  }
}