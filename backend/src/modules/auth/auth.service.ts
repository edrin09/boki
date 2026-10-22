import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { User } from '../../entities/user.entity'
import { Company } from '../../entities/company.entity'
import { UserCompany } from '../../entities/user-company.entity'
import { comparePassword, hashPassword } from '../../common/utils/crypto.util'
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface'
import type { ChangePasswordDto, LoginDto } from './dto/auth.dto'

/** 登录 / 切换公司统一返回结构 */
export interface AuthResult {
  accessToken: string
  expiresIn: string
  user: Record<string, any>
  company: Record<string, any> | null
  companies: Record<string, any>[]
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    @InjectRepository(UserCompany) private readonly linkRepo: Repository<UserCompany>,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * 账号密码登录
   *
   * 登录后默认进入「第一个可访问公司」，并把 companyId 写入令牌；
   * 用户可通过 /auth/switch-company 切换，前端刷新令牌即可。
   */
  async login(dto: LoginDto, ip?: string): Promise<AuthResult> {
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

    const companies = await this.listCompanies(user.id)
    // 无可访问公司时也允许登录（company 为 null、令牌不带 companyId），
    // 前端会引导进入「创建记账公司」流程
    return this.buildResult(user, companies, companies[0]?.id ?? null)
  }

  /**
   * 获取当前登录用户信息（含权限、菜单与可切换公司）
   */
  async profile(userId: string, companyId?: string | null): Promise<Record<string, any>> {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.roles', 'roles')
      .leftJoinAndSelect('roles.permissions', 'permissions')
      .where('u.id = :id', { id: userId })
      .getOne()

    if (!user) {
      throw new UnauthorizedException('用户不存在或已被删除')
    }

    const companies = await this.listCompanies(userId)
    const profile = this.toProfile(user)
    return {
      ...profile,
      companyId: companyId ?? null,
      company: companies.find((c) => c.id === companyId) ?? null,
      companies,
    }
  }

  /**
   * 切换记账公司：校验权限后重新签发带新 companyId 的令牌。
   * 采用重签令牌而非请求头传参，保证隔离边界由服务端签名保证。
   */
  async switchCompany(userId: string, companyId: string): Promise<AuthResult> {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.roles', 'roles')
      .leftJoinAndSelect('roles.permissions', 'permissions')
      .where('u.id = :id', { id: userId })
      .getOne()
    if (!user) throw new UnauthorizedException('用户不存在')

    const companies = await this.listCompanies(userId)
    if (!companies.some((c) => c.id === companyId)) {
      throw new ForbiddenException('您没有该公司的访问权限')
    }
    const company = companies.find((c) => c.id === companyId)!
    if (company.status !== 1) throw new ForbiddenException('该公司已停用，无法切换')

    return this.buildResult(user, companies, companyId)
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
   * 供 vault「单密钥直入」使用：跳过密码校验，仍走同一套 JWT 签发。
   *
   * ⚠️ 这是**唯一**为加密功能新增的方法，`login()` / `changePassword()` /
   * `switchCompany()` / `buildResult()` 一行未改 ——
   * 解锁（key）与登录（账号）是两件独立的事（方案 D2）。
   *
   * 注意：调用方必须自己确认「这个人有资格直接进入」，
   * 本方法只负责签发与账号密码登录**完全一致**的令牌。
   */
  async issueForUser(userId: string): Promise<AuthResult> {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.roles', 'roles')
      .leftJoinAndSelect('roles.permissions', 'permissions')
      .where('u.id = :id', { id: userId })
      .getOne()

    if (!user) throw new UnauthorizedException('用户不存在')
    if (user.status !== 1) throw new UnauthorizedException('账号已被禁用，请联系管理员')

    const companies = await this.listCompanies(user.id)
    return this.buildResult(user, companies, companies[0]?.id ?? null)
  }

  // ==================== 私有方法 ====================

  private async buildResult(
    user: User,
    companies: Record<string, any>[],
    companyId: string | null,
  ): Promise<AuthResult> {
    const { roles, permissions } = this.extractIdentity(user)
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      nickname: user.nickname,
      companyId: companyId ?? undefined,
      roles,
      permissions,
    }

    const accessToken = await this.jwtService.signAsync(payload)

    return {
      accessToken,
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
      user: this.toProfile(user),
      company: companies.find((c) => c.id === companyId) ?? null,
      companies,
    }
  }

  /** 用户可访问的公司列表 */
  private async listCompanies(userId: string): Promise<Record<string, any>[]> {
    const links = await this.linkRepo.find({
      where: { userId, status: 1 },
      order: { createdAt: 'ASC' },
    })
    if (!links.length) return []
    const companies = await this.companyRepo.find({
      where: { id: In(links.map((l) => l.companyId)) },
      order: { createdAt: 'ASC' },
    })
    const byId = new Map(companies.map((c) => [c.id, c]))
    return links
      .map((l) => {
        const c = byId.get(l.companyId)
        if (!c) return null
        return {
          id: c.id,
          code: c.code,
          name: c.name,
          taxNo: c.taxNo,
          status: c.status,
          isOwner: l.isOwner,
          createdAt: c.createdAt,
        }
      })
      .filter(Boolean) as Record<string, any>[]
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
  private toProfile(user: User): Record<string, any> {
    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      email: user.email,
      phone: user.phone,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      roles: (user.roles ?? []).map((r) => r.code),
      permissions: Array.from(
        new Set((user.roles ?? []).flatMap((r) => (r.permissions ?? []).map((p) => p.code))),
      ),
      roleNames: (user.roles ?? []).map((r) => r.name),
    }
  }
}