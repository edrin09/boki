import { Inject } from '@nestjs/common'
import { getDataSourceToken } from '@nestjs/typeorm'
import { DataSource, EntityTarget, ObjectLiteral } from 'typeorm'
import { CompanyScopedRepository } from './company.repository'

/**
 * 公司隔离仓储的注入令牌。
 *
 * 用独立 token 而非复用 TypeORM 的仓储 token，这样
 * `@InjectRepository(Account)` 与 `@InjectCompanyRepo(Account)`
 * 在同一模块里不会互相覆盖，语义也一目了然。
 */
export const COMPANY_REPO_TOKEN = (target: EntityTarget<any>): string =>
  `COMPANY_REPO:${(target as any).name ?? String(target)}`

/**
 * 注入公司隔离仓储：`@InjectCompanyRepo(Account) repo: CompanyScopedRepository<Account>`
 */
export const InjectCompanyRepo = (target: EntityTarget<any>): ParameterDecorator =>
  Inject(COMPANY_REPO_TOKEN(target))

/**
 * 为某实体生成公司隔离仓储的 provider 工厂。
 */
export function companyRepoProvider<T extends ObjectLiteral>(target: EntityTarget<T>) {
  return {
    provide: COMPANY_REPO_TOKEN(target),
    useFactory: (dataSource: DataSource) =>
      new CompanyScopedRepository<T>(dataSource.getRepository(target), target),
    inject: [getDataSourceToken()],
  }
}

/**
 * 在模块 providers 中批量展开：providers: [...companyRepoProviders(Account, Voucher)]
 */
export function companyRepoProviders(...targets: Array<EntityTarget<any>>) {
  return targets.map((t) => companyRepoProvider(t))
}

/** 便于在 useFactory 中手写场景复用 */
export type ScopedRepo<T extends ObjectLiteral> = CompanyScopedRepository<T>