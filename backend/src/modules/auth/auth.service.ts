import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User } from '../../entities/user.entity'
import { comparePassword, hashPassword } from '../../common/utils/crypto.util'
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface'
import type { ChangePasswordDto, LoginDto } from './dto/auth.dto'

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * 账号密码登录
   */
  async login(dto: LoginDto, ip?: string): Promise<{
    accessToken: string
    expiresIn: string
    user: Record<string, any>
  }> {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.password')
      .leftJoinAndSelect('u.roles', 'roles')
      .leftJoinAndSelect('roles.permissions', 'permissions')
      .where('u.username = :username', { username: dto.username })
      .getOne()

    if (!user) {
      throw new UnauthorizedException('用户名或密码错误')
    }
    if (user.status !== 1) {
      throw new UnauthorizedException('账号已被禁用，请联系管理员')
    }

    const matched = await comparePassword(dto.password, user.password)
    if (!matched) {
      throw new UnauthorizedException('用户名或密码错误')
    }

    await this.userRepo.update(user.id, {
      lastLoginAt: new Date(),
      lastLoginIp: ip ?? null,
    })

    const { roles, permissions } = this.extractIdentity(user)
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      nickname: user.nickname,
      roles,
      permissions,
    }

    const accessToken = await this.jwtService.signAsync(payload)

    return {
      accessToken,
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
      user: this.toProfile(user, roles, permissions),
    }
  }

  /**
   * 获取当前登录用户信息（含权限与菜单）
   */
  async profile(userId: string): Promise<Record<string, any>> {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.roles', 'roles')
      .leftJoinAndSelect('roles.permissions', 'permissions')
      .where('u.id = :id', { id: userId })
      .getOne()

    if (!user) {
      throw new UnauthorizedException('用户不存在或已被删除')
    }

    const { roles, permissions } = this.extractIdentity(user)
    return this.toProfile(user, roles, permissions)
  }

  /**
   * 修改本人密码
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ message: string }> {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.password')
      .where('u.id = :id', { id: userId })
      .getOne()

    if (!user) throw new UnauthorizedException('用户不存在')

    const matched = await comparePassword(dto.oldPassword, user.password)
    if (!matched) throw new UnauthorizedException('原密码不正确')

    await this.userRepo.update(user.id, {
      password: await hashPassword(dto.newPassword),
    })

    return { message: '密码修改成功，请重新登录' }
  }

  /**
   * 从用户实体提取角色与权限标识
   */
  private extractIdentity(user: User): { roles: string[]; permissions: string[] } {
    const roles = (user.roles ?? []).map((r) => r.code)
    const permissionSet = new Set<string>()
    for (const role of user.roles ?? []) {
      for (const p of role.permissions ?? []) {
        permissionSet.add(p.code)
      }
    }
    return { roles, permissions: Array.from(permissionSet) }
  }

  /**
   * 组装返回给前端的用户档案（不含密码）
   */
  private toProfile(user: User, roles: string[], permissions: string[]): Record<string, any> {
    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      email: user.email,
      phone: user.phone,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      roles,
      permissions,
      roleNames: (user.roles ?? []).map((r) => r.name),
    }
  }
}