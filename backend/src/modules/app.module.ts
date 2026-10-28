import { DynamicModule, Module } from '@nestjs/common'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { buildDatabaseOptions } from '../config/database.config'
import { GlobalAuthGuard } from '../common/guards/global-auth.guard'
import { PermissionsGuard } from '../common/guards/permissions.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { SeedService } from '../db/seed.service'
import { Permission } from '../entities/permission.entity'
import { Role } from '../entities/role.entity'
import { User } from '../entities/user.entity'
import { Account } from '../entities/account.entity'
import { Company } from '../entities/company.entity'
import { UserCompany } from '../entities/user-company.entity'
import { AuthModule } from './auth/auth.module'
import { AccountsModule } from './accounts/accounts.module'
import { PartnersModule } from './partners/partners.module'
import { VouchersModule } from './vouchers/vouchers.module'
import { InitialBalanceModule } from './initial-balance/initial-balance.module'
import { BooksModule } from './books/books.module'
import { SystemModule } from './system/system.module'
import { SetupModule } from './setup/setup.module'
import { MetaModule } from './meta/meta.module'
import { CompanyReposModule } from '../common/company/company-repos.module'
import { CompanyScopeInterceptor } from '../common/company/company-scope.interceptor'
import { PluginsModule } from '../plugins/plugins.module'
import { VaultModule } from '../vault/vault.module'

/** 内核模块（迁移完成后只保留记账底座与系统管理） */
const CORE_MODULES = [
  SetupModule,
  // Vault 必须在 AuthModule 之前：启动时的密钥加载与旧库转换都在内核完成，
  // 这里只保留公开的加密状态查询接口。
  VaultModule,
  AuthModule,
  AccountsModule,
  PartnersModule,
  VouchersModule,
  InitialBalanceModule,
  BooksModule,
  SystemModule,
  // /api/meta：应用身份与联系方式（根 .env → 桌面 sidecar env / ConfigModule），
  // 前端登录页署名等消费；无数据库依赖，必须排在最前尽快就绪
  MetaModule,
]

@Module({})
export class AppModule {
  /**
   * 创建应用根模块。
   *
   * @param pluginModules  已启用插件的 Nest 模块（按依赖顺序）
   * @param pluginEntities 已安装插件的 TypeORM 实体（含已停用，避免同步时误删表）
   */
  static register(pluginModules: any[] = [], pluginEntities: any[] = []): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          // 应用身份与联系方式的统一源在仓库根 .env；桌面 sidecar 由 Electron 主进程
          // 经 spawn env 注入（见 desktop/src/server.js buildEnv），此处按 cwd 逐级回退
          envFilePath: ['.env.local', '.env', '../.env'],
          ignoreEnvFile: false,
        }),
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          useFactory: () => buildDatabaseOptions(pluginEntities),
        }),
        TypeOrmModule.forFeature([Permission, Role, User, Account, Company, UserCompany]),
        CompanyReposModule,
        ...CORE_MODULES,
        PluginsModule,
        ...pluginModules,
      ],
      providers: [
        { provide: APP_GUARD, useClass: GlobalAuthGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
        // 注意：RolesGuard 此前未注册，导致 @RequireRoles('admin') 形同虚设
        { provide: APP_GUARD, useClass: RolesGuard },
        // 多公司隔离：守卫通过后写入公司上下文
        { provide: APP_INTERCEPTOR, useClass: CompanyScopeInterceptor },
        SeedService,
      ],
    }
  }
}
