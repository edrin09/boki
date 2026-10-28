import { Module } from '@nestjs/common'
import { CompaniesModule } from './companies/companies.module'

/**
 * 多公司（账套）管理插件。
 *
 * 边界：
 * - 插件负责公司档案的 CRUD、成员授权与数据清理；
 * - 内核保留 `sys_company` / `sys_user_company` 实体、公司上下文、
 *   登录/权限判定，以及「创建首个账套」的 /companies/bootstrap 入口；
 * - 停用/卸载本插件后，既有账套仍可正常记账与切换，只是没有管理页面。
 */
@Module({
  imports: [CompaniesModule],
})
export class MultiCompanyModule {}
