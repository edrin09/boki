import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Observable } from 'rxjs'
import type { Request } from 'express'
import { Company } from '../../entities/company.entity'
import { UserCompany } from '../../entities/user-company.entity'
import { runWithCompany } from './company-context'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'

/** 公司启用状态缓存，避免每个接口都查一次库 */
const statusCache = new Map<string, { enabled: boolean; expireAt: number }>()
const STATUS_TTL = 30_000

/**
 * 公司作用域拦截器：把当前请求的记账公司写入 AsyncLocalStorage。
 *
 * 运行时机在守卫之后，因此可以直接读取已通过 JWT 校验的 req.user.companyId。
 * 无公司上下文时（登录、公司列表等接口）原样放行，由各服务自行处理。
 */
@Injectable()
export class CompanyScopeInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    @InjectRepository(UserCompany)
    private readonly userCompanyRepo: Repository<UserCompany>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return next.handle()

    const req = context.switchToHttp().getRequest<Request>()
    const user = (req as any).user
    const companyId: string | undefined = user?.companyId

    if (!companyId) {
      // 未绑定公司的令牌：交给后续守卫/服务判断是否允许
      return next.handle()
    }

    // 异步校验公司是否仍可用，避免请求穿透到业务层
    return new Observable((subscriber) => {
      void this.ensureUsable(companyId, user?.sub)
        .then(() => {
          runWithCompany({ companyId, userId: user?.sub }, () => {
            next.handle().subscribe(subscriber)
          })
        })
        .catch((err) => subscriber.error(err))
    })
  }

  private async ensureUsable(companyId: string, userId?: string): Promise<void> {
    // 公司启停状态走短缓存，避免每个接口都查一次库
    const cached = statusCache.get(companyId)
    if (!cached || cached.expireAt < Date.now()) {
      const company = await this.companyRepo.findOne({ where: { id: companyId } })
      const enabled = !!company && company.status === 1
      statusCache.set(companyId, { enabled, expireAt: Date.now() + STATUS_TTL })
      if (!enabled) throw new ForbiddenException('当前记账公司不存在或已停用，请切换公司')
    }

    // 成员授权必须实时校验：撤销授权后旧令牌立即失效
    if (userId) await this.ensureMember(userId, companyId)
  }

  /** 校验用户仍拥有该公司访问权（被移除后旧令牌立即失效） */
  private async ensureMember(userId: string | undefined, companyId: string): Promise<void> {
    if (!userId) return
    const link = await this.userCompanyRepo.findOne({
      where: { userId, companyId, status: 1 },
    })
    if (!link) throw new ForbiddenException('无权访问该公司，请重新登录或切换公司')
  }
}

/** 公司状态变更后调用，使缓存立即失效 */
export function invalidateCompanyCache(companyId?: string): void {
  if (companyId) statusCache.delete(companyId)
  else statusCache.clear()
}