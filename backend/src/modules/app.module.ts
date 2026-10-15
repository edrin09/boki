import { Module } from '@nestjs/common'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { ConfigModule, ConfigService } from '@nestjs/config'
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
import { UsersModule } from './users/users.module'
import { RolesModule } from './roles/roles.module'
import { PermissionsModule } from './permissions/permissions.module'
import { AccountsModule } from './accounts/accounts.module'
import { PartnersModule } from './partners/partners.module'
import { BanksModule } from './banks/banks.module'
import { DepartmentsModule } from './departments/departments.module'
import { ProjectsModule } from './projects/projects.module'
import { VouchersModule } from './vouchers/vouchers.module'
import { InitialBalanceModule } from './initial-balance/initial-balance.module'
import { BooksModule } from './books/books.module'
import { ReportsModule } from './reports/reports.module'
import { CashBankModule } from './cash-bank/cash-bank.module'
import { ArApModule } from './ar-ap/ar-ap.module'
import { IncomeExpenseModule } from './income-expense/income-expense.module'
import { SystemModule } from './system/system.module'
import { EmployeesModule } from './employees/employees.module'
import { ExpenseClaimsModule } from './expense-claims/expense-claims.module'
import { LoansModule } from './loans/loans.module'
import { BankStmtModule } from './bank-stmt/bank-stmt.module'
import { PayrollModule } from './payroll/payroll.module'
import { OcrModule } from './ocr/ocr.module'
import { ReceiptsModule } from './receipts/receipts.module'
import { ExtractModule } from './extract/extract.module'
import { CompaniesModule } from './companies/companies.module'
import { CompanyReposModule } from '../common/company/company-repos.module'
import { CompanyScopeInterceptor } from '../common/company/company-scope.interceptor'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      ignoreEnvFile: false,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: () => buildDatabaseOptions(),
    }),
    TypeOrmModule.forFeature([Permission, Role, User, Account, Company, UserCompany]),
    CompanyReposModule,
    CompaniesModule,
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    AccountsModule,
    PartnersModule,
    BanksModule,
    DepartmentsModule,
    ProjectsModule,
    VouchersModule,
    InitialBalanceModule,
    BooksModule,
    ReportsModule,
    CashBankModule,
    ArApModule,
    IncomeExpenseModule,
    SystemModule,
    EmployeesModule,
    ExpenseClaimsModule,
    LoansModule,
    BankStmtModule,
    PayrollModule,
    OcrModule,
    ReceiptsModule,
    ExtractModule,
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
})
export class AppModule {}