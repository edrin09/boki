import { ForbiddenException } from '@nestjs/common'
import {
  DataSource,
  EntityManager,
  EntityTarget,
  ObjectLiteral,
  Repository,
  SelectQueryBuilder,
} from 'typeorm'
import { requireCompanyId } from './company-context'

/**
 * 公司隔离的查询构造器代理。
 *
 * 把用户自己写的 `where` / `andWhere` 原样转发，再统一追加
 * `company_id = 当前公司`，避免业务代码各处手工拼条件而漏写。
 * 用 `andWhere` 而非 `where`，因此不会覆盖调用方已有的条件。
 */
function withCompanyScope<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  companyId: string,
): SelectQueryBuilder<T> {
  const alias = qb.alias
  return qb.andWhere(`${alias}.company_id = :__companyId`, { __companyId: companyId })
}

/**
 * 公司隔离仓储。
 *
 * 包装 TypeORM Repository：读操作自动追加 `company_id` 过滤，
 * 写操作（save/insert/create）自动补齐 companyId。
 * 服务层照常使用 `find/findOne/count/createQueryBuilder/save/delete/update`，
 * 无需感知多公司逻辑。
 */
export class CompanyScopedRepository<T extends ObjectLiteral> {
  constructor(
    private readonly repo: Repository<T>,
    private readonly target: EntityTarget<T>,
  ) {}

  /** 供需要绕过隔离的内部逻辑（如按 ID 全局校验）使用 */
  get raw(): Repository<T> {
    return this.repo
  }

  // ---------------- 读 ----------------

  createQueryBuilder(alias?: string, qb?: SelectQueryBuilder<T>): SelectQueryBuilder<T> {
    const built = this.repo.createQueryBuilder(alias as any, qb as any) as SelectQueryBuilder<T>
    if (!alias) {
      // 无别名时（如 from('table','x')）在 where 处补条件
      const originalFrom = built.from.bind(built)
      ;(built as any).from = (...args: any[]) => {
        const result = originalFrom(...args)
        const tableAlias = args[1]
        if (tableAlias) {
          built.andWhere(`${tableAlias}.company_id = :__companyId`, {
            __companyId: requireCompanyId(),
          })
        }
        return result
      }
      return built
    }
    return withCompanyScope(built, requireCompanyId())
  }

  async find(options?: any): Promise<T[]> {
    return this.repo.find(this.withScope(options))
  }

  async findBy(where: any): Promise<T[]> {
    return this.repo.findBy(this.withScope(where))
  }

  async findAndCount(options?: any): Promise<[T[], number]> {
    return this.repo.findAndCount(this.withScope(options))
  }

  async findOne(options?: any): Promise<T | null> {
    return this.repo.findOne(this.withScope(options))
  }

  async findOneBy(where: any): Promise<T | null> {
    return this.repo.findOneBy(this.withScope(where))
  }

  async count(options?: any): Promise<number> {
    return this.repo.count(this.withScope(options))
  }

  async countBy(where: any): Promise<number> {
    return this.repo.countBy(this.withScope(where))
  }

  async exists(options?: any): Promise<boolean> {
    return this.repo.exists(this.withScope(options))
  }

  async existsBy(where: any): Promise<boolean> {
    return this.repo.existsBy(this.withScope(where))
  }

  // ---------------- 写 ----------------

  create(entityLike: any): T {
    return this.repo.create(this.stamp(entityLike)) as unknown as T
  }

  async save(entity: any): Promise<any> {
    if (Array.isArray(entity)) return this.repo.save(entity.map((e) => this.stamp(e)))
    return this.repo.save(this.stamp(entity))
  }

  async insert(entity: any): Promise<any> {
    return this.repo.insert(this.stamp(entity))
  }

  async update(criteria: any, partial: any): Promise<any> {
    return this.repo.update(this.scopeCriteria(criteria), partial)
  }

  async delete(criteria: any): Promise<any> {
    return this.repo.delete(this.scopeCriteria(criteria))
  }

  async remove(entity: T): Promise<any> {
    return this.repo.remove(entity)
  }

  async increment(criteria: any, propertyPath: string, value: number | string): Promise<any> {
    return this.repo.increment(this.scopeCriteria(criteria), propertyPath as any, value as any)
  }

  async decrement(criteria: any, propertyPath: string, value: number | string): Promise<any> {
    return this.repo.decrement(this.scopeCriteria(criteria), propertyPath as any, value as any)
  }

  async preload(entityLike: any): Promise<T | null> {
    return this.repo.preload(this.stamp(entityLike))
  }

  get metadata() {
    return this.repo.metadata
  }

  get manager(): EntityManager {
    return this.repo.manager
  }

  get target_(): EntityTarget<T> {
    return this.target
  }

  // ---------------- 内部 ----------------

  private get cid(): string {
    return requireCompanyId()
  }

  /** 给查询选项里的 where 追加 companyId */
  private withScope(options: any): any {
    if (options === undefined || options === null) {
      return { where: { companyId: this.cid } }
    }
    if (typeof options !== 'object' || Array.isArray(options)) return options
    const next = { ...options }
    if (next.where === undefined) {
      next.where = { companyId: this.cid }
    } else if (typeof next.where === 'object' && next.where !== null && !Array.isArray(next.where)) {
      next.where = { ...next.where, companyId: this.cid }
    } else {
      // Brackets / 字符串条件：改为包一层 AND
      const inner = next.where
      next.where = (qb: any) => {
        qb.andWhere({ companyId: this.cid })
        if (typeof inner === 'function') return inner(qb)
        return qb.andWhere(inner)
      }
    }
    return next
  }

  /** 给 delete/update 的条件追加 companyId（字符串 ID 无法表达，单独按主键处理） */
  private scopeCriteria(criteria: any): any {
    if (typeof criteria === 'string') {
      throw new ForbiddenException('删除/更新请传入对象条件，以便限定公司范围')
    }
    if (Array.isArray(criteria)) {
      return criteria.map((c) => ({ ...c, companyId: this.cid }))
    }
    return { ...criteria, companyId: this.cid }
  }

  /** 写入时补齐 companyId（已显式指定则保留） */
  private stamp(entity: any): any {
    if (!entity || typeof entity !== 'object') return entity
    if (entity.companyId) return entity
    return { ...entity, companyId: this.cid }
  }
}

/**
 * 构造公司隔离仓储的工厂，供各模块的 useFactory 使用。
 */
export function createCompanyScopedRepo<T extends ObjectLiteral>(
  dataSource: DataSource,
  target: EntityTarget<T>,
): CompanyScopedRepository<T> {
  return new CompanyScopedRepository<T>(dataSource.getRepository(target), target)
}